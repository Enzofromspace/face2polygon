# Face2polygon — session handoff

Written September 21, 2026 (Africa/Nairobi). Covers the initial implementation session on September 20 and this closing handoff.

## Current state

A working V1 Vite + React + TypeScript browser app exists in `/Users/ewc/Desktop/code/face2polygon`. Dependencies and the two ONNX models are installed locally. Production builds and automated checks passed during implementation. The dev server was stopped at the user's request; restart it when resuming. No deployment was performed in this session.

The project working tree was clean immediately before creating this document. Recheck Git status when resuming; do not assume earlier conversation messages describe the latest committed state.

## What was done

- Shallow-cloned HRFFA into `reference/hrffa/` and added that directory to `.gitignore`.
- Inspected the upstream README, license, and browser demo before implementing the app. Left the reference checkout unchanged.
- Viewed all three visual references in `ref-files/`: the stylized floating head, green mesh face, and very coarse angular face. The target is a general late-1990s/early-3D-game aesthetic, not a recreation of a particular character.
- Adapted HRFFA browser detector, aligner, camera, canvas, and ONNX runtime code into an independent application.
- Added a dedicated inference worker, primary-head selection, WebGPU preference, and a fresh-worker WASM fallback during initialization/warmup.
- Built the polygon mesh and Canvas renderer, three detail settings, debug visualization, and genuine transparent-background mode.
- Added camera permission/start/stop/cancel handling, status/FPS/facet counts, and PNG export.
- Added reproducible model downloads with upstream SHA-256 checks, local runtime asset staging, npm lockfile, and attribution.
- Added responsive UI, README, tests, and a GitHub Pages workflow with repository-subpath support.

## Requirements to preserve

Keep the app entirely client-side: no backend, cloud inference, database, authentication, or API keys. Prefer WebGPU with WASM fallback. Keep the implementation understandable and use Canvas 2D unless a concrete requirement justifies WebGL. Preserve large flat-shaded triangles and intentionally simplified facial structure; more detail is not automatically better.

Do not modify `reference/hrffa/`. Before major inference/architecture changes, inspect the relevant upstream browser-demo code instead of replacing existing functionality blindly. The reference checkout must not become an application dependency: builds and deployment work without it.

## Frame and inference pipeline

1. `src/App.tsx` requests a video-only webcam stream and captures a 640 × 480 snapshot into a hidden canvas.
2. It retains that image for rendering and transfers a separate RGBA buffer to the worker. Only one inference request is outstanding at a time.
3. `src/workers/inference.worker.ts` runs YOLOv9-n Wholebody34 detection. Head class is 7; score threshold is 0.35. Upstream decoding includes greedy NMS.
4. On initial acquisition, the largest head wins. Subsequent selection favors size and proximity to the previous box. This is spatial continuity, not identity tracking. Large jumps flag a subject change.
5. HRFFA hg0-256 predicts 68 iBUG landmarks and visibility labels from a square head crop with 5% padding. The adapted aligner uses the upstream `center05` preprocessing and maps normalized crop coordinates back into frame pixels.
6. The main thread updates the mesh and renders it over the same snapshot used for inference. This avoids pairing old landmarks with a newer camera image, but makes visible frame rate depend on inference speed.
7. No-head results clear/reset the mesh. Stop/cancel invalidates pending work, terminates the worker, and stops media tracks. Processing pauses while the document is hidden.

Models, pinned in `models.lock.json`:

- `yolov9_n_wholebody34_0100_1x3x640x640.onnx` (~3.2 MB)
- `hrffa_hg0_ibug68_1x3x256x256.onnx` (~6.9 MB)

`src/runtime/ort.ts` loads ONNX Runtime Web 1.27.0's WebGPU bundle, which also registers WASM. WASM uses one thread so GitHub Pages does not need cross-origin isolation headers. Both models run a warmup before the UI reports readiness. If WebGPU initialization or warmup fails, the app creates a fresh WASM worker; this avoids reusing a failed runtime initialization. Runtime failures after startup currently stop capture and show a retry message.

## How polygon rendering works

The main implementation is `src/mesh.ts`.

### Geometry and silhouette

- Coarse uses 26 selected landmarks around the jaw, brows, eyes, nose, and mouth; medium adds 17 more; fine uses all 68.
- Every setting adds nine synthetic points: seven upper-skull boundary points and two interior forehead points. Total vertex counts are therefore 35, 52, and 77. Triangle counts depend on the geometry/convex hull, not a fixed preset.
- The line between eye landmarks 36 and 45 defines the local horizontal direction. Its perpendicular, oriented toward chin landmark 8, defines down. This makes the forehead extension follow head roll.
- Synthetic skull width comes from eye span and jaw width. Height uses eye span and the detector box height with bounds. These are geometric approximations, not hair segmentation or a recovered skull.
- Landmarks receive artificial depth values: nose tip 0.34, other nose points 0.22, mouth 0.10, other face points 0; synthetic forehead points use 0.04. Depth affects lighting only. Screen positions remain 2D.

### Stabilization and triangulation

- Motion-adaptive exponential smoothing updates screen coordinates. The smoothing factor is `1 - exp(-elapsedMs / tau)`.
- `tau` is 110 ms for small motion and 45 ms when displacement exceeds 5% of the head-box width. This reduces small jitter while reacting faster to larger motion.
- Delaunator triangulates the current vertex positions when acquiring a mesh or changing detail.
- Triangle connectivity is then frozen to prevent continual Delaunay diagonal switching. It resets after tracking loss, a flagged subject change, or a change in vertex count.
- Non-finite coordinates reset the mesh. Near-zero-area triangles are skipped when drawing.

### Facet color and shading

- Each triangle samples four webcam pixels: its centroid and three points between the centroid and its vertices. Their RGB values are averaged.
- A pseudo-normal derived from 2D positions and artificial depth creates a directional light multiplier, clamped to 0.64–1.2.
- RGB values are quantized in steps of 12, then temporally blended: 60% previous facet color + 40% new color.
- Each triangle is filled with one solid color. A thin same-color stroke hides rasterization seams. Debug replaces the stroke with green mesh edges and draws orange vertex dots.
- This is a 2.5D flat-shaded effect: no texture mapping, true 3D reconstruction, perspective camera, or depth buffer.

### Background and export

In webcam mode the source snapshot is drawn first, then the mesh. In transparent mode the canvas is cleared and only polygons are drawn. The checkerboard is CSS behind the canvas, so it does not appear in PNG exports. The preview is mirrored with CSS; exported PNGs retain original camera orientation.

## Important files

| File/directory | Role |
| --- | --- |
| `src/App.tsx` | UI, settings, webcam lifecycle, frame loop, fallback, export |
| `src/mesh.ts` | Landmark subsets, synthetic head boundary, smoothing, triangulation, color/shading |
| `src/workers/inference.worker.ts` | Model initialization, primary-head selection, detector/aligner execution |
| `src/runtime/client.ts` | Worker requests, transferable buffers, timeout, termination |
| `src/runtime/ort.ts` | ONNX sessions, runtime paths, tensor conversion/disposal |
| `src/hrffa/` | Adapted upstream detection/alignment/types/constants |
| `src/style.css` | Responsive UI, mirrored preview, checkerboard |
| `scripts/fetch-models.mjs` | Download and hash verification |
| `scripts/prepare-assets.mjs` | Stage models and ONNX runtime assets into `public/` |
| `models.lock.json` | Exact model names, sizes, hashes, release URL |
| `tests/mesh.test.ts` | Geometry/detail/smoothing/topology tests |
| `scripts/browser-smoke.mjs` | Chrome fake-webcam inference and canvas checks |
| `vite.config.ts` | React, relative `base: './'`, ES module workers |
| `.github/workflows/pages.yml` | Build/test and GitHub Pages deployment on `main` |
| `public/HRFFA-LICENSE.txt` | Required upstream MIT attribution, included in build |
| `README.md` | Startup, deployment, controls, model terms, limitations |

## Resume commands

```sh
cd /Users/ewc/Desktop/code/face2polygon
npm run dev
```

Open the printed local URL (normally `http://localhost:5173/`) and enable the camera. Use `?backend=wasm` to force WASM.

On a fresh checkout, first run:

```sh
npm ci
npm run fetch:models
```

Validation:

```sh
npm run typecheck
npm test
npm run build
# With the dev server running and Google Chrome installed:
npm run test:browser
```

To repeat the production subpath check, run the preview in one terminal and the browser check in another:

```sh
npm run preview -- --host 127.0.0.1 --base /face2polygon/
APP_URL='http://127.0.0.1:4173/face2polygon/?backend=wasm' npm run test:browser
```

The browser test defaults to port 5173. It uses installed Chrome via Playwright, not a downloaded Playwright Chromium. The controlled-landmark mesh test uses a development source import and is skipped when `APP_URL` is set. The screenshot is written to `/tmp/face2polygon-initial.png`; treat it as ephemeral.

This environment's sandbox blocked npm/GitHub network access, local listening sockets, and headless Chrome without escalation. Use the normal approval mechanism if those restrictions recur. Do not mistake sandbox errors for application defects.

## What was verified, and what was not

Passed during implementation:

- Dependency installation and model size/hash verification.
- `npm run typecheck`, `npm run build`, and both mesh unit tests.
- Headless Chrome with actual WASM detector and aligner warmup, followed by fake-webcam frame inference.
- Controlled-landmark polygon rasterization, nonempty facet coverage, transparent canvas corners, and stream cleanup.
- Production model/runtime/worker loading and inference at `/face2polygon/`.
- Reference checkout remained unmodified.

The first browser run timed out during initialization; a diagnostic rerun passed, as did the production subpath test. No persistent cause was established. If it recurs, inspect initialization status, worker errors, and runtime asset requests.

Crucial distinction: the fake webcam contains no human face. Warmup executes the aligner against a supplied box, but the smoke test does **not** prove successful real-person detection → landmarks → attractive overlay end to end. Real webcam quality, WebGPU performance, and other browsers were not verified. The user started and stopped the dev server but did not provide visual quality feedback in this conversation.

## Next session: recommended priorities

These are suggestions, not additional requested changes already approved for implementation.

1. Start with a real webcam review. Check frontal pose, talking/blinking, roll/yaw/pitch, movement, leaving/re-entering, and a second person. Note FPS/backend and collect concrete quality feedback before changing architecture.
2. Refine the visual result in `src/mesh.ts`: landmark subsets, forehead offsets, artificial depth, light direction/strength, and color quantization are the main tuning points. Preserve the coarse reference aesthetic.
3. Evaluate frozen topology under large expressions/profile turns. It prevents diagonal flicker but can produce stretched, inverted, or overlapping triangles. Consider controlled topology resets or a designed facial topology if evidence warrants it.
4. Improve occlusion handling. HRFFA visibility labels are returned but currently ignored by the renderer. The synthetic silhouette can include background or miss hair; extreme profiles are a likely weakness.
5. Profile before optimizing. Detection currently runs every frame, a new OffscreenCanvas is allocated per worker frame, and pixel buffers are copied. Reusing buffers/canvases or reducing detector frequency may help, but should not break frame/landmark alignment.
6. Validate camera deny/cancel/retry, rapid stop/restart, transparent PNG alpha, debug/detail changes, and mobile resizing. Test WebGPU and explicit WASM on target browsers/devices.

Other practical notes:

- Rendering is inference-paced; WASM may be visibly slow. Color smoothing uses a fixed per-frame weight, so its response varies with FPS.
- The synthetic depth scale currently uses frame width, not detected head size. Inspect shading consistency as the user moves nearer/farther before adjusting it.
- Spatial head selection can switch subjects; it is not identity recognition.
- The 640 × 480 capture draws the video into that rectangle. Check unusual camera aspect ratios for distortion.
- Runtime GPU loss does not automatically recover to WASM; only startup/warmup failure does.
- Worker messages currently use broad `any` types in parts of the transport. Tightening the protocol is a reasonable small maintainability improvement if those files change.
- The build was about 113 MB because runtime variants are staged locally and Vite also emits a WASM asset. Asset deduplication is optional future optimization, not a blocker.
- `models/`, `public/models/`, `public/wasm/`, `node_modules/`, `dist/`, and `reference/hrffa/` are ignored. Fresh environments need dependency/model setup; committed application code does not need the reference checkout.
- GitHub Pages requires selecting **GitHub Actions** as the Pages source. No deployment has been verified on a real GitHub-hosted URL yet.
- Keep upstream attribution. Model/backbone/data terms are separate from the MIT source-code license; existing README links explain this distinction.
