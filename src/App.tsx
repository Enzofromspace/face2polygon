import { useEffect, useRef, useState } from 'react';
import { InferenceClient } from './runtime/client';
import { openCamera, stopStream } from './runtime/camera';
import { PolygonMesh } from './mesh';
import { PolygonMask, maskFacets, maskOptions, type MaskId } from './masks';
const previews = Object.fromEntries(maskOptions.filter(m => m.id !== 'default').map(m => [m.id, maskFacets(m.id as Exclude<MaskId, 'default'>)]));
export default function App() {
    const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
    const [running, setRunning] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState('Camera is off'), [error, setError] = useState('');
    const [transparent, setTransparent] = useState(false), [detail, setDetail] = useState(0), [debug, setDebug] = useState(false), [backend, setBackend] = useState('—'), [fps, setFps] = useState(0), [facets, setFacets] = useState(0);
    const [mask, setMask] = useState<MaskId>('default');
    const settings = useRef({ transparent, detail, debug, mask });
    settings.current = { transparent, detail, debug, mask };
    const state = useRef<{
        generation: number;
        stream: MediaStream | null;
        client: InferenceClient | null;
        raf: number;
    }>({ generation: 0, stream: null, client: null, raf: 0 });
    function stop() { const s = state.current; s.generation++; cancelAnimationFrame(s.raf); stopStream(s.stream); s.stream = null; s.client?.dispose(); s.client = null; if (video.current)
        video.current.srcObject = null; canvas.current?.getContext('2d')?.clearRect(0, 0, 640, 480); setRunning(false); setBusy(false); setStatus('Camera is off'); setFacets(0); setFps(0); }
    useEffect(() => () => { const s = state.current; s.generation++; cancelAnimationFrame(s.raf); stopStream(s.stream); s.client?.dispose(); }, []);
    async function start() {
        const s = state.current;
        const generation = ++s.generation;
        const active = () => generation === s.generation;
        setBusy(true);
        setError('');
        setStatus('Requesting camera…');
        try {
            const stream = await openCamera(null);
            if (!active()) {
                stopStream(stream);
                return;
            }
            s.stream = stream;
            video.current!.srcObject = stream;
            await video.current!.play();
            if (!active())
                return;
            const forced = new URLSearchParams(location.search).get('backend') === 'wasm';
            let chosen: 'webgpu' | 'wasm' = !forced && 'gpu' in navigator ? 'webgpu' : 'wasm';
            setStatus('Loading head & landmark models…');
            s.client = new InferenceClient();
            try {
                await s.client.init(chosen);
            }
            catch (e) {
                if (!active())
                    return;
                if (chosen === 'wasm')
                    throw e;
                s.client.dispose();
                chosen = 'wasm';
                setStatus('Switching to WASM…');
                s.client = new InferenceClient();
                await s.client.init(chosen);
            }
            if (!active())
                return;
            setBackend(chosen.toUpperCase());
            setRunning(true);
            setBusy(false);
            const capture = document.createElement('canvas');
            capture.width = 640;
            capture.height = 480;
            const captureCtx = capture.getContext('2d', { willReadFrequently: true })!;
            const ctx = canvas.current!.getContext('2d')!;
            const mesh = new PolygonMesh();
            const overlay = new PolygonMask();
            let last = performance.now();
            const tick = async () => {
                if (!active())
                    return;
                if (document.hidden) {
                    s.raf = requestAnimationFrame(() => void tick());
                    return;
                }
                try {
                    captureCtx.drawImage(video.current!, 0, 0, 640, 480);
                    const frame = captureCtx.getImageData(0, 0, 640, 480);
                    // Keep the render snapshot separate from the transferred inference buffer.
                    const result = await s.client!.process(new ImageData(new Uint8ClampedArray(frame.data), 640, 480));
                    if (!active())
                        return;
                    const now = performance.now();
                    const dt = now - last;
                    last = now;
                    ctx.clearRect(0, 0, 640, 480);
                    if (!settings.current.transparent)
                        ctx.putImageData(frame, 0, 0);
                    if (result.head) {
                        if (result.switched) {
                            mesh.reset(); overlay.reset();
                        }
                        mesh.update(result.head, settings.current.detail, dt);
                        overlay.update(result.head, dt);
                        if (settings.current.mask === 'default') {
                            mesh.draw(ctx, frame, settings.current.debug);
                            setFacets(mesh.triangles.length / 3);
                        } else {
                            setFacets(overlay.draw(ctx, settings.current.mask, settings.current.detail, settings.current.debug));
                        }
                        setStatus('Tracking primary head');
                    }
                    else {
                        mesh.reset(); overlay.reset();
                        setStatus('Looking for a head — face the camera');
                        setFacets(0);
                    }
                    setFps(Math.round(1000 / dt));
                    s.raf = requestAnimationFrame(() => void tick());
                }
                catch (e) {
                    if (active()) {
                        stop();
                        setError(`Inference stopped: ${e instanceof Error ? e.message : String(e)} Try restarting, or open ?backend=wasm.`);
                    }
                }
            };
            void tick();
        }
        catch (e) {
            if (active()) {
                stop();
                setError(e instanceof Error ? e.message : String(e));
            }
        }
    }
    function snapshot() { const a = document.createElement('a'); a.download = `face2polygon-${mask}.png`; a.href = canvas.current!.toDataURL('image/png'); a.click(); }
    return <main>
    <header><a className="brand" href="./">F<span>→</span>P <small>FACE TO POLYGON</small></a><span className="edition">EXPERIMENT 001 / REAL-TIME</span></header>
    <section className="intro"><div className="eyebrow">LESS GEOMETRY. MORE CHARACTER.</div><h1>Your face.<br /><em>Another era.</em></h1><p>A little late-90s geometry, live from your webcam.<br />Turn yourself into a floating polygon head.</p></section>
    <section className="workspace"><div className="viewer"><div className="view-top"><span><i className={running ? 'live' : ''}/> {running ? 'LIVE CAPTURE' : 'CAPTURE WINDOW'}</span><span>640 × 480</span></div><div className={`stage ${transparent ? 'checker' : ''}`}><video ref={video} muted playsInline hidden/><canvas ref={canvas} width={640} height={480} aria-label={`Live polygon preview: ${maskOptions.find(m => m.id === mask)?.name}`}/>{!running && <div className="empty"><svg viewBox="0 0 160 180" aria-hidden="true"><path d="M40 20 80 4 120 20 142 65 130 125 80 174 30 125 18 65Z" fill="#323e32"/><path d="m80 4-30 58 30 20 30-20Z" fill="#829477"/><path d="m18 65 32-3 30 20-50 43Z" fill="#596d50"/><path d="m142 65-32-3-30 20 50 43Z" fill="#46573f"/><path d="m80 82-18 42h36Z" fill="#b8cc9d"/><path d="m30 125 50 49v-34Zm100 0-50 49v-34Z" fill="#637b57"/><path d="m48 72 20 7-20 7m64-14-20 7 20 7" fill="#d8ff81"/></svg><strong>{busy ? 'Bringing your head online…' : 'A new face, with fewer faces.'}</strong><span>{busy ? status : 'Enable your camera to enter polygon mode.'}</span></div>}</div><div className="view-bottom"><span role="status">{status}</span><span>{fps} FPS · {facets} FACETS</span></div></div>
    <aside><div className="panel-heading"><span>CONTROL ROOM</span><span>01</span></div><h2>Make it polygon.</h2><p className="muted">Big planes. Sharp edges. You.</p><button className="primary" onClick={running || busy ? stop : () => void start()}>{busy ? 'Cancel' : running ? 'Stop camera' : 'Enable camera'} <span>{running ? '■' : '↗'}</span></button>{error && <p role="alert" className="error">{error}</p>}<div className="control"><label id="mask-label">FACE / MASK</label><div className="mask-picker" role="group" aria-labelledby="mask-label">{maskOptions.map(option => <button key={option.id} className="mask-option" aria-pressed={mask === option.id} onClick={() => setMask(option.id)}><svg viewBox="-105 -200 210 350" aria-hidden="true">{option.id === 'default' ? <><path d="M-70-95 0-116 70-95 88 20 38 125 0 140-38 125-88 20Z" fill="#829477"/><path d="M0-116-88 20 0 60 88 20Z" fill="#596d50"/><path d="M0-30-25 60 25 60Z" fill="#d2ff79"/><path d="M-60 0-25 5M25 5 60 0M-25 95 25 95" stroke="#17220b" strokeWidth="9"/></> : previews[option.id].map((facet,i) => <polygon key={i} points={facet.points.map(p => p.join(',')).join(' ')} fill={facet.color} stroke={facet.color} strokeWidth="0.5"/>)}</svg><span>{option.name}</span></button>)}</div><p>Keep your polygon face or try a mask. Each follows your head as you move.</p></div><div className="control"><label>BACKGROUND</label><div className="segmented"><button aria-pressed={!transparent} onClick={() => setTransparent(false)}>Webcam</button><button aria-pressed={transparent} onClick={() => setTransparent(true)}>Transparent</button></div><p>Transparent mode keeps only your face or mask.</p></div><div className="control"><label htmlFor="detail">GEOMETRY <b>{['Coarse', 'Medium', 'Fine'][detail]}</b></label><input id="detail" type="range" min="0" max="2" step="1" value={detail} onChange={e => setDetail(+e.target.value)}/><div className="range-labels"><span>Chunky</span><span>Detailed</span></div></div><div className="control debug"><label htmlFor="debug">Show mesh & landmarks</label><input id="debug" type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)}/></div><button className="secondary" disabled={!running} onClick={snapshot}>Save PNG <span>↓</span></button><div className="engine"><span>INFERENCE ENGINE</span><strong>{backend}</strong><p>Processed on your device.<br />Your camera never leaves this browser.</p></div></aside></section>
    <footer><span>INSPIRED BY THE EARLY DAYS OF 3D.</span><span>HRFFA LANDMARKS / CANVAS FACETS</span></footer>
  </main>;
}
