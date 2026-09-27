import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrimaryHeadSelector } from '../src/runtime/head-selection.ts';
import type { HeadBox } from '../src/hrffa/types.ts';

const box = (x: number, size = 100): HeadBox => ({ x1: x, y1: 100, x2: x + size, y2: 100 + size, score: 0.9 });

test('initially chooses largest, then stays with the nearby primary head', () => {
    const selector = new PrimaryHeadSelector();
    const first = box(100, 120), other = box(400);
    assert.equal(selector.update([other, first], 0).box, first);
    const next = box(115, 120);
    assert.equal(selector.update([box(350, 200), next], 33).box, next);
});

test('occlusion and isolated distant false positives do not redirect tracking', () => {
    const selector = new PrimaryHeadSelector();
    selector.update([box(100)], 0);
    assert.equal(selector.update([], 33).box, undefined);
    assert.equal(selector.update([box(400)], 66).box, undefined);
    const recovered = box(120);
    assert.deepEqual(selector.update([recovered], 99), { box: recovered, switched: false });
});

test('confirms a moving replacement across slow inference observations', () => {
    const selector = new PrimaryHeadSelector();
    selector.update([box(100)], 0);
    assert.equal(selector.update([box(350)], 1000).box, undefined);
    const replacement = box(385);
    assert.deepEqual(selector.update([replacement], 2000), { box: replacement, switched: true });
    assert.equal(selector.update([box(390)], 4000).switched, false);
});

test('missing observations and expired candidates break replacement streaks', () => {
    const selector = new PrimaryHeadSelector();
    selector.update([box(100)], 0);
    selector.update([box(400)], 33);
    selector.update([], 66);
    assert.equal(selector.update([box(400)], 99).box, undefined);
    const reacquired = box(400);
    assert.equal(selector.update([reacquired], 3000).box, reacquired);
    assert.equal(selector.update([box(400)], 3033).switched, false);
});

test('very slow inference can reacquire after the old association and candidate expire', () => {
    const selector = new PrimaryHeadSelector();
    selector.update([box(100)], 0);
    assert.equal(selector.update([box(400)], 3000).box, undefined);
    const replacement = box(420);
    assert.deepEqual(selector.update([replacement], 6000), { box: replacement, switched: false });
    assert.equal(selector.update([box(430)], 9000).box?.x1, 430);
});

test('invalid boxes and isolated scale explosions are not admitted', () => {
    const selector = new PrimaryHeadSelector();
    assert.equal(selector.update([{ ...box(100), x1: NaN }], 0).box, undefined);
    selector.update([box(100)], 33);
    assert.equal(selector.update([box(100, 500)], 66).box, undefined);
    assert.equal(selector.update([box(110)], 99).switched, false);
});
