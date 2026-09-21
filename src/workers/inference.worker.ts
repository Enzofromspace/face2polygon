// Inference geometry and preprocessing adapted from HRFFA's MIT browser demo.
import { HeadDetector } from '../hrffa/detector';
import { FaceAligner } from '../hrffa/aligner';
import { loadOrtModel } from '../runtime/ort';
import { setAssetBaseUrl, type OrtModel } from '../runtime/engine';
import type { FrameSource, HeadBox } from '../hrffa/types';
let detector: HeadDetector;
let aligner: FaceAligner;
let previous: HeadBox | undefined;
const models: OrtModel[] = [];
function source(canvas: OffscreenCanvas): FrameSource {
    return { width: canvas.width, height: canvas.height,
        draw: (ctx, w, h) => ctx.drawImage(canvas, 0, 0, w, h),
        drawCrop: (ctx, x, y, w, h, dw, dh) => ctx.drawImage(canvas, x, y, w, h, 0, 0, dw, dh) };
}
async function handle(msg: any) {
    if (msg.type === 'init') {
        setAssetBaseUrl(msg.base);
        for (const name of ['yolov9_n_wholebody34_0100_1x3x640x640.onnx', 'hrffa_hg0_ibug68_1x3x256x256.onnx']) {
            const response = await fetch(new URL(`models/${name}`, msg.base));
            if (!response.ok)
                throw new Error(`Model download failed (${response.status}). Run npm run fetch:models, then restart.`);
            models.push(await loadOrtModel(new Uint8Array(await response.arrayBuffer()), msg.backend, 1));
        }
        detector = new HeadDetector(models[0], 0.35);
        aligner = new FaceAligner(models[1], 'center05', 0.05);
        const warm = source(new OffscreenCanvas(640, 480));
        await detector.detect(warm);
        await aligner.align(warm, [{ x1: 160, y1: 60, x2: 480, y2: 420, score: 1 }]);
        self.postMessage({ type: 'ready', backend: msg.backend });
    }
    else if (msg.type === 'frame') {
        const start = performance.now();
        const canvas = new OffscreenCanvas(msg.width, msg.height);
        canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(msg.rgba), msg.width, msg.height), 0, 0);
        const src = source(canvas);
        const boxes = await detector.detect(src);
        // Prefer spatial continuity, then the largest head on initial acquisition.
        const area = (b: HeadBox) => (b.x2 - b.x1) * (b.y2 - b.y1);
        const rank = (b: HeadBox) => {
            if (!previous)
                return area(b);
            const distance = Math.hypot((b.x1 + b.x2 - previous.x1 - previous.x2) / 2, (b.y1 + b.y2 - previous.y1 - previous.y2) / 2);
            return area(b) / (1 + distance * distance / 400);
        };
        boxes.sort((a, b) => rank(b) - rank(a));
        const box = boxes[0];
        const switched = !!box && !!previous && Math.hypot(box.x1 - previous.x1, box.y1 - previous.y1) > Math.max(previous.x2 - previous.x1, previous.y2 - previous.y1) * 0.7;
        previous = box;
        const head = box ? (await aligner.align(src, [box]))[0] : null;
        self.postMessage({ type: 'result', head, switched, ms: performance.now() - start });
    }
}
self.onmessage = (event) => { void handle(event.data).catch(error => self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })); };
