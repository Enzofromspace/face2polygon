import type { HeadResult } from '../hrffa/types';
export interface Result {
    head: HeadResult | null;
    switched: boolean;
    ms: number;
}
export class InferenceClient {
    private worker = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), { type: 'module' });
    private pending?: {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    };
    constructor() {
        this.worker.onmessage = ({ data }) => {
            const pending = this.pending;
            this.pending = undefined;
            if (!pending)
                return;
            clearTimeout(pending.timer);
            if (data.type === 'error')
                pending.reject(new Error(data.message));
            else
                pending.resolve(data);
        };
        this.worker.onerror = event => this.fail(new Error(event.message || 'Inference worker failed.'));
    }
    private fail(error: Error) { if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(error);
        this.pending = undefined;
    } }
    private request(message: unknown, transfer: Transferable[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.pending)
                return reject(new Error('Inference already in progress'));
            this.pending = { resolve, reject, timer: setTimeout(() => this.fail(new Error('Inference timed out. Try restarting with WASM.')), 120000) };
            this.worker.postMessage(message, transfer);
        });
    }
    async init(backend: 'webgpu' | 'wasm') {
        const base = new URL(import.meta.env.BASE_URL, document.baseURI).href;
        await this.request({ type: 'init', backend, base });
    }
    process(frame: ImageData): Promise<Result> {
        const rgba = frame.data.buffer as ArrayBuffer;
        return this.request({ type: 'frame', rgba, width: frame.width, height: frame.height }, [rgba]);
    }
    dispose() { this.fail(new Error('Stopped')); this.worker.terminate(); }
}
