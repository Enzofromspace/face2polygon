import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskFacets, maskTransform } from '../src/masks.ts';
import type { HeadResult } from '../src/hrffa/types.ts';
test('mask frame maps eyes and chin and follows rotation', () => {
    const points = new Float32Array(136);
    points.set([140,200],72); points.set([260,200],90); points.set([200,340],16);
    const head: HeadResult = {points,box:{x1:100,y1:80,x2:300,y2:340,score:1},visibility:new Uint8Array(68)};
    assert.deepEqual(maskTransform(head),[1,0,0,1,200,200]);
    for(let i=0;i<68;i++){const x=points[i*2],y=points[i*2+1];points[i*2]=-y;points[i*2+1]=x;}
    assert.deepEqual(maskTransform(head),[0,1,-1,0,-200,200]);
    points[72]=NaN; assert.equal(maskTransform(head),null);
});
test('all four masks have distinct art and increasing geometry detail', () => {
    const signatures = new Set<string>();
    for (const id of ['fox','metal','fawkes','dali'] as const) {
        const coarse = maskFacets(id,0);
        signatures.add(JSON.stringify(coarse));
        assert.ok(maskFacets(id,1).length>coarse.length);
        assert.ok(maskFacets(id,2).length>maskFacets(id,1).length);
        assert.ok(coarse.every(f=>f.points.length>=3 && f.points.flat().every(Number.isFinite)));
    }
    assert.equal(signatures.size,4);
});
