import Delaunator from 'delaunator';
import type { HeadResult } from './hrffa/types';

export type MaskId = 'default' | 'fox' | 'metal' | 'fawkes' | 'dali';
export const maskOptions: { id: MaskId; name: string }[] = [
    { id: 'default', name: 'Your face' }, { id: 'fox', name: 'Fox' },
    { id: 'metal', name: 'Metal' }, { id: 'fawkes', name: 'Fawkes' }, { id: 'dali', name: 'Dalí' },
];
type Vertex = [number, number];
type Facet = { points: Vertex[]; color: string };
const outline: Vertex[] = [[-72,-94],[-35,-110],[0,-116],[35,-110],[72,-94],[88,-40],[88,20],[70,80],[38,125],[0,140],[-38,125],[-70,80],[-88,20],[-88,-40]];
const interior: Vertex[] = [[0,-70],[-48,-45],[48,-45],[-58,0],[58,0],[-25,0],[25,0],[0,-10],[-28,55],[28,55],[0,60],[-48,85],[48,85],[0,100]];
const palettes = { fox: ['#e8e9df','#d3d7d0','#f8f8ec','#bdc5bf'], metal: ['#555d60','#30383c','#7f8889','#a3aaab'], fawkes: ['#e9dfc8','#cfc4ae','#fff3dc','#b8ad98'], dali: ['#dcc795','#bca571','#f1dfad','#a99062'] };

// Original polygon artwork drawn from the four reference/masks photographs.
export function maskFacets(id: Exclude<MaskId, 'default'>, detail = 0): Facet[] {
    const vertices = [...outline, ...interior];
    const facets: Facet[] = [];
    const add = (color: string, ...points: Vertex[]) => facets.push({ color, points });
    const symmetric = (color: string, ...points: Vertex[]) => {
        add(color, ...points); add(color, ...points.map(([x,y]): Vertex => [-x,y]));
    };
    if (id === 'fox') {
        symmetric('#e5e8df', [-87,-35],[-83,-125],[-56,-192],[-25,-100]);
        symmetric('#202624', [-73,-95],[-58,-160],[-42,-102]);
    }
    const triangles = Delaunator.from(vertices).triangles;
    for (let i=0; i<triangles.length; i+=3) {
        const points = [vertices[triangles[i]], vertices[triangles[i+1]], vertices[triangles[i+2]]];
        const palette = palettes[id];
        const color = palette[(i / 3 * 7) % palette.length];
        if (detail > 0) {
            const center: Vertex = [points.reduce((s,p)=>s+p[0],0)/3, points.reduce((s,p)=>s+p[1],0)/3];
            points.forEach((p,j) => {
                const next = points[(j+1)%3];
                if (detail === 2) {
                    const mid: Vertex = [(p[0]+next[0])/2,(p[1]+next[1])/2];
                    add(color,p,mid,center); add(palette[(i/3+j+1)%4],mid,next,center);
                } else add(palette[(i/3+j)%4],p,next,center);
            });
        } else add(color,...points);
    }
    if (id === 'fox') {
        symmetric('#171d1d', [-78,-22],[-55,-26],[-30,-11],[-18,16],[-46,-2]);
        symmetric('#991b30', [-87,5],[-74,23],[-44,38],[-32,54],[-66,36],[-83,25]);
        symmetric('#b12536', [-80,37],[-62,50],[-43,63],[-65,56]);
        symmetric('#a51d31', [-32,-61],[-20,-52],[-14,-32],[-24,-39]);
        add('#ae1f34',[-7,-83],[0,-91],[8,-83],[6,-59],[0,-35],[-6,-59]);
        add('#951b2b',[-14,64],[14,64],[10,72],[3,77],[2,96],[-2,96],[-3,77],[-10,72]);
        symmetric('#951b2b',[0,94],[-23,102],[-46,93],[-57,77],[-51,97],[-24,108],[0,99]);
    } else if (id === 'metal') {
        symmetric('#252d30',[-81,-39],[-12,-22],[-15,-7],[-76,-20]);
        symmetric('#101719',[-74,-15],[-18,-4],[-22,22],[-72,24]);
        symmetric('#a8b2af',[-65,-7],[-26,0],[-29,10],[-65,12]);
        add('#252d30',[0,-25],[-24,57],[24,57]);
        add('#90999a',[0,-25],[5,47],[24,57]);
        add('#151c20',[-37,78],[37,78],[32,104],[-32,104]);
        for (const x of [-25,-10,5,20]) add('#8d9695',[x,81],[x+7,81],[x+7,89],[x,89]);
        symmetric('#1b2225',[-73,49],[-66,45],[-63,79],[-69,72]);
        add('#727b7b',[-22,114],[22,114],[28,127],[-28,127]);
    } else {
        const dark = '#211f1b';
        symmetric(dark,[-77,-46],[-51,-57],[-17,-37],[-18,-29],[-52,-45]);
        symmetric(dark,[-65,-6],[-47,-15],[-24,-6],[-19,4],[-58,5]);
        if (id === 'dali') {
            symmetric('#f4f4e9',[-64,-9],[-47,-16],[-24,-6],[-25,9],[-48,17],[-63,9]);
            add('#e7cd93',[-12,-24],[12,-24],[18,64],[0,73],[-18,64]);
            add('#ae9465',[0,-17],[0,66],[-18,64]);
            symmetric(dark,[0,79],[-37,84],[-55,77],[-62,48],[-67,18],[-66,78],[-57,94],[-21,93],[0,86]);
        } else {
            add('#f5e8cb',[-10,-27],[10,-27],[17,48],[0,58],[-17,48]);
            symmetric(dark,[0,64],[-13,71],[-26,84],[-49,82],[-69,67],[-52,91],[-29,95],[-11,84]);
            add('#66503d',[-40,102],[0,107],[40,102],[0,113]);
            add(dark,[-10,116],[10,116],[4,136],[0,140],[-4,136]);
        }
    }
    return facets;
}

// Eye line and chin form a roll-aware affine frame; smoothing avoids camera jitter.
export function maskTransform(head: HeadResult): number[] | null {
    const p = head.points;
    const dx = p[90]-p[72], dy = p[91]-p[73];
    const cx = (p[72]+p[90])/2, cy = (p[73]+p[91])/2;
    const transform = [dx/120,dy/120,(p[16]-cx)/140,(p[17]-cy)/140,cx,cy];
    if (!transform.every(Number.isFinite) || Math.hypot(dx,dy)<10 || Math.abs(transform[0]*transform[3]-transform[1]*transform[2])<0.05) return null;
    return transform;
}
export class PolygonMask {
    private transform: number[] | null = null;
    private key = '';
    private facets: Facet[] = [];
    reset() { this.transform = null; }
    update(head: HeadResult, elapsed: number) {
        const next = maskTransform(head);
        if (!next) { this.reset(); return; }
        const alpha = 1-Math.exp(-Math.max(0,elapsed)/65);
        this.transform = next.map((v,i)=>this.transform ? this.transform[i]+(v-this.transform[i])*alpha : v);
    }
    draw(ctx: CanvasRenderingContext2D, id: Exclude<MaskId,'default'>, detail: number, debug: boolean) {
        if (!this.transform) return 0;
        const key = `${id}:${detail}`;
        if (key !== this.key) { this.facets = maskFacets(id,detail); this.key = key; }
        ctx.save();
        ctx.transform(...this.transform as [number,number,number,number,number,number]);
        for (const {points,color} of this.facets) {
            ctx.beginPath(); ctx.moveTo(...points[0]);
            points.slice(1).forEach(p=>ctx.lineTo(...p)); ctx.closePath();
            ctx.fillStyle = color; ctx.fill();
            ctx.strokeStyle = debug ? '#b8ff60' : color; ctx.lineWidth = debug ? 0.7 : 0.45; ctx.stroke();
        }
        if (debug) {
            ctx.fillStyle = '#ff795b';
            for (const [x,y] of [[-60,0],[60,0],[0,140]]) { ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); }
        }
        ctx.restore();
        return this.facets.length;
    }
}
