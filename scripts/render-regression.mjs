import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage();
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/');
    const report = await page.evaluate(async () => {
        const { PolygonPreview } = await import('/src/runtime/preview.ts');
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const points = new Float32Array(136);
        for (let i = 0; i < 68; i++) {
            points[i * 2] = 240 + 70 * Math.cos(i * 2.4);
            points[i * 2 + 1] = 240 + 90 * Math.sin(i * 2.4);
        }
        points.set([180, 200], 72); points.set([300, 200], 90); points.set([240, 350], 16);
        const head = { points, box: { x1: 140, y1: 80, x2: 340, y2: 370, score: 1 }, visibility: new Uint8Array(68).fill(2) };
        const move = dx => ({ ...head,
            box: { ...head.box, x1: head.box.x1 + dx, x2: head.box.x2 + dx },
            points: points.map((v, i) => v + (i % 2 === 0 ? dx : 0)) });
        const frame = color => {
            const image = new ImageData(640, 480);
            for (let i = 0; i < image.data.length; i += 4) image.data.set([...color, 255], i);
            return image;
        };
        const first = frame([160, 120, 90]), second = frame([20, 190, 230]);
        const pixels = () => ctx.getImageData(0, 0, 640, 480).data;
        const check = (ok, message) => { if (!ok) throw new Error(message); };
        const equal = (a, b) => a.every((v, i) => v === b[i]);
        let sequences = 0;
        const times = [];
        for (const mask of ['default', 'fox', 'metal', 'fawkes', 'dali']) {
            for (const transparent of [false, true]) {
                for (const detail of [0, 1, 2]) {
                    const preview = new PolygonPreview();
                    const settings = { mask, transparent, detail, faceDetail: detail * 50, debug: false };
                    const render = (h, image, now, switched = false) => preview.render(ctx, image, { head: h, switched, ms: 33 }, now, settings);
                    check(render(head, first, 100).facets > 0, `${mask}: initial render empty`);
                    const initial = pixels();
                    render(null, second, 133);
                    check(equal(initial, pixels()), `${mask}: dropout mixed image/geometry or changed smoothing`);
                    render(move(210), second, 166, true);
                    check(equal(initial, pixels()), `${mask}: isolated jump changed visible frame`);
                    const bad = { ...head, points: points.slice() }; bad.points[0] = 10000;
                    render(bad, second, 199);
                    check(equal(initial, pixels()), `${mask}: finite invalid landmark rendered`);
                    const recovered = render(move(8), second, 232);
                    check(recovered.status === 'Tracking primary head', `${mask}: failed to recover`);
                    check(!equal(initial, pixels()), `${mask}: valid movement never rendered`);
                    render(null, first, 733);
                    const cleared = pixels();
                    check(transparent ? cleared.every(v => v === 0) : equal(cleared, first.data), `${mask}: lost face did not clear`);
                    check(render(move(210), second, 766).facets > 0, `${mask}: reacquisition empty`);
                    for (let i = 0; i < 20; i++) {
                        const start = performance.now();
                        render(move(210 + Math.sin(i / 3) * 10), second, 800 + i * 33);
                        times.push(performance.now() - start);
                    }
                    sequences++;
                }
            }
        }
        // Settings remain usable during recovery, including switching renderers.
        const preview = new PolygonPreview();
        const settings = { mask: 'default', transparent: false, detail: 0, faceDetail: 25, debug: false };
        preview.render(ctx, first, { head, switched: false, ms: 33 }, 100, settings);
        const changed = preview.render(ctx, second, { head: null, switched: false, ms: 33 }, 133,
            { ...settings, mask: 'fox', transparent: true });
        check(changed.facets > 0 && pixels()[3] === 0, 'controls did not apply during recovery');
        times.sort((a, b) => a - b);
        return { sequences, frames: times.length, renderMedianMs: times[Math.floor(times.length / 2)], renderP95Ms: times[Math.floor(times.length * 0.95)] };
    });
    console.log('Matched-frame dropout, outlier, recovery, mask/detail/background regression checks passed:', report);
} finally {
    await browser.close();
}
