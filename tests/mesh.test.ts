import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PolygonMesh, meshPoints } from '../src/mesh.ts';
import type { HeadResult } from '../src/hrffa/types.ts';
const head: HeadResult = { box: { x1: 100, y1: 50, x2: 300, y2: 330, score: 1 }, points: new Float32Array(136), visibility: new Uint8Array(68).fill(2) };
for (let i = 0; i < 68; i++) {
    head.points[i * 2] = 200 + 80 * Math.cos(i * 2.4);
    head.points[i * 2 + 1] = 200 + 100 * Math.sin(i * 2.4);
}
head.points.set([150, 170], 72);
head.points.set([250, 170], 90);
head.points.set([200, 320], 16);
test('detail adds facets and synthetic forehead extends above eyes', () => { const counts = [0, 1, 2].map(detail => { const mesh = new PolygonMesh(); mesh.update(head, detail, 33); assert.ok(mesh.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))); return mesh.triangles.length; }); assert.ok(counts[0] < counts[1] && counts[1] < counts[2]); assert.ok(meshPoints(head, 0).slice(-9).some(p => p.y < 100)); });
test('topology stays stable and motion is smoothed', () => { const mesh = new PolygonMesh(); mesh.update(head, 0, 33); const old = mesh.points[0].x; const topology = [...mesh.triangles]; const moved = { ...head, points: head.points.map((v, i) => v + (i % 2 === 0 ? 5 : 0)) }; mesh.update(moved, 0, 16); assert.ok(mesh.points[0].x > old && mesh.points[0].x < old + 5); assert.deepEqual(mesh.triangles, topology); mesh.reset(); assert.equal(mesh.triangles.length, 0); });
