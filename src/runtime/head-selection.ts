import type { HeadBox } from '../hrffa/types';

// A candidate must survive the next observation, including on slower WASM devices.
const CANDIDATE_GRACE_MS = 2500;
const area = (box: HeadBox) => (box.x2 - box.x1) * (box.y2 - box.y1);
function distance(a: HeadBox, b: HeadBox) {
    return Math.hypot((a.x1 + a.x2 - b.x1 - b.x2) / 2, (a.y1 + a.y2 - b.y1 - b.y2) / 2)
        / Math.max(1, Math.sqrt(area(a)), Math.sqrt(area(b)));
}
function coherent(a: HeadBox, b: HeadBox) {
    const ratio = area(a) / area(b);
    return ratio > 0.4 && ratio < 2.5 && distance(a, b) < 0.7;
}
function valid(box: HeadBox) {
    return [box.x1, box.y1, box.x2, box.y2, box.score].every(Number.isFinite)
        && box.x2 > box.x1 && box.y2 > box.y1;
}

/** Keep identity through occlusion without treating one distant detection as a switch.
 * The remembered box is only an association reference; missing observations return
 * no box, so callers cannot mistake it for fresh geometry in the current frame.
 */
export class PrimaryHeadSelector {
    private previous?: HeadBox;
    private candidate?: HeadBox;
    private candidateAt = -Infinity;

    update(boxes: HeadBox[], now: number): { box: HeadBox | undefined; switched: boolean } {
        let largest: HeadBox | undefined;
        let nearest: HeadBox | undefined;
        let nearestDistance = Infinity;
        let candidateMatch: HeadBox | undefined;
        let candidateDistance = Infinity;
        if (this.candidate && now - this.candidateAt > CANDIDATE_GRACE_MS) {
            this.candidate = undefined;
            // No primary observation has matched since this candidate started.
            // Its expiry also retires that old association, allowing slow devices
            // to reacquire instead of restarting confirmation forever.
            this.previous = undefined;
        }
        for (const box of boxes) {
            if (!valid(box)) continue;
            if (!largest || area(box) > area(largest)) largest = box;
            if (this.previous && coherent(box, this.previous)) {
                const d = distance(box, this.previous);
                if (d < nearestDistance) { nearest = box; nearestDistance = d; }
            }
            if (this.candidate && coherent(box, this.candidate)) {
                const d = distance(box, this.candidate);
                if (d < candidateDistance) { candidateMatch = box; candidateDistance = d; }
            }
        }
        if (!largest) {
            this.candidate = undefined;
            return { box: undefined, switched: false };
        }
        if (!this.previous || nearest) {
            this.previous = nearest ?? largest;
            this.candidate = undefined;
            return { box: this.previous, switched: false };
        }
        if (candidateMatch) {
            this.previous = candidateMatch;
            this.candidate = undefined;
            return { box: candidateMatch, switched: true };
        }
        this.candidate = largest;
        this.candidateAt = now;
        return { box: undefined, switched: false };
    }
}
