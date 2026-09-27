import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StableHead } from '../src/runtime/tracking.ts';
import type { HeadResult } from '../src/hrffa/types.ts';

function head(): HeadResult {
    const points = new Float32Array(136).fill(200);
    points.set([140, 200], 72); points.set([260, 200], 90); points.set([200, 340], 16);
    return { points, box: { x1: 100, y1: 80, x2: 300, y2: 340, score: 1 }, visibility: new Uint8Array(68) };
}
test('brief missing results preserve geometry; prolonged loss clears and reacquires', () => {
    const tracking = new StableHead(), first = head();
    assert.equal(tracking.update(null, 0).head, null);
    assert.equal(tracking.update(first, 100).reset, true);
    assert.deepEqual(tracking.update(null, 200), { head: first, fresh: false, reset: false });
    assert.equal(tracking.update(null, 600).head, first);
    assert.equal(tracking.update(null, 601).head, null);
    assert.equal(tracking.update(head(), 650).reset, true);
});
test('invalid landmarks and degenerate transforms are treated as dropouts', () => {
    const tracking = new StableHead(), first = head();
    tracking.update(first, 0);
    const invalid = head(); invalid.points[10] = NaN;
    assert.equal(tracking.update(invalid, 100).head, first);
    const collapsed = head(); collapsed.points.set([140, 200], 90);
    assert.equal(tracking.update(collapsed, 200).fresh, false);
    assert.equal(tracking.update(invalid, 501).head, null);
});
function move(source: HeadResult, dx: number): HeadResult {
    return { ...source, box: { ...source.box, x1: source.box.x1 + dx, x2: source.box.x2 + dx },
        points: source.points.map((v, i) => v + (i % 2 === 0 ? dx : 0)) };
}
test('single jumps never redirect rendering, but consistent rapid motion reacquires', () => {
    const tracking = new StableHead(), first = head();
    tracking.update(first, 0);
    const jumped = move(first, 200);
    assert.equal(tracking.update(jumped, 33, true).head, first);
    assert.equal(tracking.update(first, 66).head, first);
    assert.equal(tracking.update(jumped, 99).fresh, false);
    const next = move(jumped, 20);
    assert.deepEqual(tracking.update(next, 132), { head: next, fresh: true, reset: true });
});
test('slow valid inference does not reset topology', () => {
    const tracking = new StableHead();
    tracking.update(head(), 0);
    assert.equal(tracking.update(head(), 1000).reset, false);
});
test('finite landmarks outside the crop cannot redirect geometry', () => {
    const tracking = new StableHead(), first = head(), invalid = head();
    tracking.update(first, 0);
    invalid.points[0] = 10000;
    assert.equal(tracking.update(invalid, 33).head, first);
});
test('invalid observations break candidate confirmation; expired holds can reacquire', () => {
    const tracking = new StableHead(), first = head(), jumped = move(first, 200);
    tracking.update(first, 0);
    tracking.update(jumped, 33);
    tracking.update(null, 66);
    assert.equal(tracking.update(jumped, 99).fresh, false);
    assert.equal(tracking.update(jumped, 3000).head, null);
    assert.equal(tracking.update(jumped, 3033).reset, true);
});
test('very slow inference can reacquire after the previous face and candidate expire', () => {
    const tracking = new StableHead(), first = head(), jumped = move(first, 200);
    tracking.update(first, 0);
    assert.equal(tracking.update(jumped, 3000).head, null);
    assert.equal(tracking.update(jumped, 6000).head, jumped);
});
