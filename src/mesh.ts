import Delaunator from 'delaunator';
import type { HeadResult } from './hrffa/types';
export interface Point {
    x: number;
    y: number;
    z: number;
    mouth?: boolean;
}
const coarse = [0, 3, 5, 8, 11, 13, 16, 17, 19, 21, 22, 24, 26, 27, 30, 31, 33, 35, 36, 39, 42, 45, 48, 51, 54, 57];
// Add facial landmarks progressively, but keep a sparse, speech-friendly lip mesh.
// Closely packed lip contours produce sliver triangles when the mouth closes.
const extra = [1, 15, 4, 12, 6, 10, 28, 37, 43, 40, 46, 2, 14, 7, 9, 18, 25, 20, 23, 29, 32, 34, 38, 44, 41, 47];
const mouthIds = [48, 51, 54, 57, 62, 66];
export function meshPoints(head: HeadResult, detail: number): Point[] {
    const p = (i: number): Point => ({ x: head.points[i * 2], y: head.points[i * 2 + 1], z: i === 30 ? 0.34 : i >= 27 && i <= 35 ? 0.22 : i >= 48 ? 0.1 : 0, mouth: i >= 48 });
    const level = Number.isFinite(detail) ? Math.max(0, Math.min(2, detail)) : 0;
    const ids = [...coarse.filter(i => i < 48), ...mouthIds, ...extra.slice(0, Math.round(level / 2 * extra.length))];
    const points = ids.map(p);
    // Roll-aware upper skull: eye axis defines right; chin defines down.
    const left = p(36), right = p(45), chin = p(8);
    const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    const eyeSpan = Math.max(10, Math.hypot(right.x - left.x, right.y - left.y));
    const ux = (right.x - left.x) / eyeSpan, uy = (right.y - left.y) / eyeSpan;
    let vx = -uy, vy = ux;
    if ((chin.x - mid.x) * vx + (chin.y - mid.y) * vy < 0) {
        vx = -vx;
        vy = -vy;
    }
    const width = Math.max(eyeSpan * 0.85, Math.hypot(p(16).x - p(0).x, p(16).y - p(0).y) * 0.5);
    const height = Math.max(eyeSpan * 0.85, Math.min((head.box.y2 - head.box.y1) * 0.52, eyeSpan * 1.25));
    for (const [x, y] of [[-0.98, -0.32], [-0.78, -0.83], [-0.38, -1.05], [0, -1.12], [0.38, -1.05], [0.78, -0.83], [0.98, -0.32], [-0.38, -0.4], [0.38, -0.4]]) {
        points.push({ x: mid.x + ux * x * width + vx * y * height, y: mid.y + uy * x * width + vy * y * height, z: 0.04 });
    }
    return points;
}
export class PolygonMesh {
    points: Point[] = [];
    triangles: number[] = [];
    private colors: number[][] = [];
    reset() { this.points = []; this.triangles = []; this.colors = []; }
    update(head: HeadResult, detail: number, elapsed: number) {
        const next = meshPoints(head, detail);
        if (next.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
            this.reset();
            return;
        }
        const fresh = this.points.length !== next.length;
        const scale = Math.max(30, head.box.x2 - head.box.x1);
        this.points = next.map((p, i) => {
            const old = this.points[i];
            if (fresh || !old)
                return p;
            const motion = Math.hypot(p.x - old.x, p.y - old.y) / scale;
            // Lips need to follow small syllable movements without the face
            // smoothing swallowing them. Retain a little filtering for jitter.
            const response = p.mouth ? 28 : motion > 0.05 ? 45 : 110;
            const alpha = 1 - Math.exp(-Math.max(0, elapsed) / response);
            return { ...p, x: old.x + (p.x - old.x) * alpha, y: old.y + (p.y - old.y) * alpha };
        });
        // Freeze topology until detail or subject changes: no diagonal flicker.
        if (fresh) {
            // Seed lips in a slightly open pose so a closed mouth on the first
            // frame cannot merge the upper/lower vertices out of the topology.
            const lips = this.points.filter(p => p.mouth);
            const [left, , right] = lips;
            const dx = right.x - left.x, dy = right.y - left.y;
            const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
            const pose = [[-0.5, 0], [0, -0.22], [0.5, 0], [0, 0.22], [0, -0.09], [0, 0.09]];
            let lip = 0;
            const seed = this.points.map(p => {
                if (!p.mouth) return p;
                const [x, y] = pose[lip++];
                return { x: center.x + dx * x - dy * y, y: center.y + dy * x + dx * y };
            });
            this.triangles = Array.from(Delaunator.from(seed, p => p.x, p => p.y).triangles);
            this.colors = [];
        }
    }
    draw(ctx: CanvasRenderingContext2D, frame: ImageData, debug: boolean, updateColors = true) {
        const { data, width, height } = frame;
        const sample = (x: number, y: number) => {
            const offset = (Math.max(0, Math.min(height - 1, Math.round(y))) * width + Math.max(0, Math.min(width - 1, Math.round(x)))) * 4;
            return [data[offset], data[offset + 1], data[offset + 2]];
        };
        for (let i = 0; i < this.triangles.length; i += 3) {
            const a = this.points[this.triangles[i]], b = this.points[this.triangles[i + 1]], c = this.points[this.triangles[i + 2]];
            const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
            if (Math.abs(area) < 0.5)
                continue;
            if (updateColors || !this.colors[i]) {
                const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3;
                const samples = [sample(cx, cy), ...([a, b, c].map(p => sample(cx * 0.6 + p.x * 0.4, cy * 0.6 + p.y * 0.4)))];
                const depth = width * 0.25;
                const nx = ((b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)) * depth;
                const ny = ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)) * depth;
                const sign = area < 0 ? -1 : 1;
                const light = Math.max(0.64, Math.min(1.2, 0.91 + (-nx * 0.3 - ny * 0.4 + Math.abs(area) * 0.16) * sign / Math.hypot(nx, ny, area)));
                const color = [0, 1, 2].map(channel => Math.max(0, Math.min(255, Math.round(samples.reduce((sum, s) => sum + s[channel], 0) / 4 * light / 12) * 12)));
                const old = this.colors[i];
                this.colors[i] = color.map((v, j) => old ? old[j] * 0.6 + v * 0.4 : v);
            }
            ctx.fillStyle = `rgb(${this.colors[i].map(Math.round).join(',')})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = debug ? '#b8ff60' : ctx.fillStyle;
            ctx.lineWidth = debug ? 1 : 0.6;
            ctx.stroke();
        }
        if (debug) {
            ctx.fillStyle = '#ff795b';
            for (const p of this.points) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}
