import { PolygonMesh } from '../mesh';
import { PolygonMask, type MaskId } from '../masks';
import type { Result } from './client';
import { StableHead } from './tracking';

export interface PreviewSettings {
    mask: MaskId;
    transparent: boolean;
    faceDetail: number;
    detail: number;
    debug: boolean;
}

// An accepted image and its geometry are one presentation unit. Never sample a
// new image with held landmarks, or advance smoothing on a rejected observation.
export class PolygonPreview {
    private tracking = new StableHead();
    private mesh = new PolygonMesh();
    private overlay = new PolygonMask();
    private frame: ImageData | null = null;
    private lastAccepted = 0;
    private renderedMask: MaskId | null = null;
    private renderedDetail = -1;

    render(ctx: CanvasRenderingContext2D, frame: ImageData, result: Result, now: number, settings: PreviewSettings) {
        const tracked = this.tracking.update(result.head, now, result.switched);
        const elapsed = this.lastAccepted ? now - this.lastAccepted : 1000;
        if (tracked.fresh) {
            this.frame = frame;
            this.lastAccepted = now;
        }
        if (tracked.reset || !tracked.head) {
            this.mesh.reset();
            this.overlay.reset();
            this.renderedMask = null;
        }
        const image = tracked.head && this.frame ? this.frame : frame;
        ctx.clearRect(0, 0, image.width, image.height);
        if (!settings.transparent) ctx.putImageData(image, 0, 0);
        let facets = 0;
        if (tracked.head) {
            const changedMask = this.renderedMask !== settings.mask;
            const changedDetail = this.renderedDetail !== settings.faceDetail;
            if (settings.mask === 'default') {
                if (changedMask) this.mesh.reset();
                if (tracked.fresh || changedMask || changedDetail)
                    this.mesh.update(tracked.head, settings.faceDetail / 50, elapsed);
                // Reusing held frames must not keep changing the facet colors.
                this.mesh.draw(ctx, image, settings.debug, tracked.fresh || changedMask || changedDetail);
                facets = this.mesh.triangles.length / 3;
            } else {
                if (changedMask) this.overlay.reset();
                if (tracked.fresh || changedMask) this.overlay.update(tracked.head, elapsed);
                facets = this.overlay.draw(ctx, settings.mask, settings.detail, settings.debug);
            }
            this.renderedMask = settings.mask;
            this.renderedDetail = settings.faceDetail;
        } else {
            this.frame = null;
        }
        return { facets, status: tracked.head
            ? tracked.fresh ? 'Tracking primary head' : 'Recovering head tracking…'
            : 'Looking for a head — face the camera' };
    }
}
