import type { HeadResult } from '../hrffa/types';

export const TRACKING_GRACE_MS = 500;
const CANDIDATE_MAX_AGE_MS = 2500;

// Validate geometry independently of any particular mask's affine transform.
export function validHead(head: HeadResult | null): head is HeadResult {
    if (!head || head.points.length !== 136 || !head.points.every(Number.isFinite)) return false;
    const { x1, y1, x2, y2 } = head.box;
    if (![x1, y1, x2, y2].every(Number.isFinite)) return false;
    const w = x2 - x1, h = y2 - y1;
    if (w < 10 || h < 10) return false;
    const p = head.points;
    for (let i = 0; i < 136; i += 2) {
        if (p[i] < x1 - w * 0.35 || p[i] > x2 + w * 0.35
            || p[i + 1] < y1 - h * 0.35 || p[i + 1] > y2 + h * 0.35) return false;
    }
    const dx = p[90] - p[72], dy = p[91] - p[73];
    const span = Math.hypot(dx, dy);
    const chinX = p[16] - (p[72] + p[90]) / 2, chinY = p[17] - (p[73] + p[91]) / 2;
    // Reject collapsed eye/chin frames, but allow roll and partially turned faces.
    return span >= 5 && span <= Math.max(w, h) * 1.3
        && Math.abs(dx * chinY - dy * chinX) / span >= 5;
}

function continuous(a: HeadResult, b: HeadResult, tolerance = 0.35) {
    const scale = Math.max(a.box.x2 - a.box.x1, a.box.y2 - a.box.y1);
    const eyeSpan = (h: HeadResult) => Math.hypot(h.points[90] - h.points[72], h.points[91] - h.points[73]);
    const ratio = eyeSpan(b) / eyeSpan(a);
    if (ratio < 0.65 || ratio > 1.55) return false;
    // Check the whole face: finite but wildly displaced landmarks must not poison topology.
    let squared = 0;
    for (let i = 0; i < 136; i++) squared += (a.points[i] - b.points[i]) ** 2;
    return Math.sqrt(squared / 68) < scale * tolerance;
}

export class StableHead {
    private head: HeadResult | null = null;
    private lastSeen = -Infinity;
    private candidate: HeadResult | null = null;
    private candidateAt = -Infinity;

    update(head: HeadResult | null, now: number, switched = false) {
        if (now - this.candidateAt > CANDIDATE_MAX_AGE_MS) this.candidate = null;
        let reset = false;
        let fresh = false;
        if (validHead(head)) {
            const discontinuity = !!this.head && (switched || !continuous(this.head, head));
            // A switch hint is not proof: require another consistent observation.
            if (discontinuity || this.candidate) {
                if (this.head && !switched && continuous(this.head, head)) {
                    this.candidate = null;
                } else if (this.candidate && now - this.candidateAt <= CANDIDATE_MAX_AGE_MS
                    && continuous(this.candidate, head, 0.25)) {
                    this.candidate = null;
                    reset = true;
                } else {
                    this.candidate = head;
                    this.candidateAt = now;
                    head = null;
                }
            }
            if (head) {
                reset ||= !this.head;
                this.head = head;
                this.lastSeen = now;
                fresh = true;
            }
        } else {
            this.candidate = null;
        }
        if (!fresh && now - this.lastSeen > TRACKING_GRACE_MS) this.head = null;
        return { head: this.head, fresh, reset };
    }
}
