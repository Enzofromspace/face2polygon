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
test('progressive detail adds geometry without crowding the lips', () => {
    const levels = Array.from({ length: 101 }, (_, i) => meshPoints(head, i / 50));
    assert.ok(new Set(levels.map(points => points.length)).size > 20);
    levels.forEach((points, i) => {
        assert.equal(points.filter(p => p.mouth).length, 6);
        if (i) assert.ok(points.length >= levels[i - 1].length);
    });
});
test('small speech movements respond faster than the rest of the face', () => {
    const mesh = new PolygonMesh(); mesh.update(head, 0, 33);
    const before = mesh.points.map(p => ({ ...p }));
    const moved = { ...head, points: head.points.map((v, i) => v + (i % 2 === 0 ? 4 : 0)) };
    mesh.update(moved, 0, 16);
    const lip = mesh.points.findIndex(p => p.mouth);
    const lipMotion = mesh.points[lip].x - before[lip].x;
    const faceMotion = mesh.points[0].x - before[0].x;
    assert.ok(lipMotion > faceMotion * 2);
    assert.ok(lipMotion > 0 && lipMotion < 4);
});
test('a closed mouth retains both lip vertices when speech starts', () => {
    const closed = { ...head, points: head.points.slice() };
    for (const id of [48, 51, 54, 57, 62, 66]) closed.points.set([id === 48 ? 175 : id === 54 ? 225 : 200, 250], id * 2);
    const mesh = new PolygonMesh(); mesh.update(closed, 0, 33);
    const topology = [...mesh.triangles];
    mesh.points.forEach((p, i) => { if (p.mouth) assert.ok(topology.includes(i)); });
    const opened = { ...closed, points: closed.points.slice() };
    opened.points[66 * 2 + 1] += 15;
    opened.points[57 * 2 + 1] += 20;
    mesh.update(opened, 0, 33);
    assert.deepEqual(mesh.triangles, topology);
    assert.ok(mesh.points.filter(p => p.mouth).some(p => p.y > 260));
});
