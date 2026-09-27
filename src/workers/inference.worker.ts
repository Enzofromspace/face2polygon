// Inference geometry and preprocessing adapted from HRFFA's MIT browser demo.
import { HeadDetector } from '../hrffa/detector';
import { FaceAligner } from '../hrffa/aligner';
import { loadOrtModel } from '../runtime/ort';
import { setAssetBaseUrl, type OrtModel } from '../runtime/engine';
import { PrimaryHeadSelector } from '../runtime/head-selection';
import { validHead } from '../runtime/tracking';
import type { FrameSource } from '../hrffa/types';
let detector: HeadDetector;
let aligner: FaceAligner;
const selection = new PrimaryHeadSelector();
let frameCanvas: OffscreenCanvas | undefined;
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
        const canvas = frameCanvas ??= new OffscreenCanvas(msg.width, msg.height);
        if (canvas.width !== msg.width) canvas.width = msg.width;
        if (canvas.height !== msg.height) canvas.height = msg.height;
        canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(msg.rgba), msg.width, msg.height), 0, 0);
        const src = source(canvas);
        const boxes = await detector.detect(src);
        const { box, switched } = selection.update(boxes, performance.now());
        const aligned = box ? (await aligner.align(src, [box]))[0] : null;
        const head = validHead(aligned) ? aligned : null;
        self.postMessage({ type: 'result', head, switched, ms: performance.now() - start });
    }
}
self.onmessage = (event) => { void handle(event.data).catch(error => self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })); };
