# Face → Polygon

A client-side webcam experiment with chunky, flat-shaded facial planes inspired by early 3D games. React + TypeScript + Vite, Canvas 2D, and HRFFA inference in a dedicated worker. Camera frames never leave the browser.

## Local development

Node 22.12+ recommended.

```sh
npm install
npm run fetch:models
npm run dev
```

Open the localhost URL and select **Enable camera**. Model downloads total about 10 MB and are checked against the upstream SHA-256 manifest. `dev` and `build` stage models and the installed ONNX runtime assets locally; no runtime CDN or API keys are needed.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

## Controls

- Webcam / Transparent switches the canvas background. The checkerboard is CSS behind the transparent canvas; saved PNGs retain alpha.
- Geometry selects coarse, medium, or fine landmark subsets. Coarse is the intended aesthetic.
- Debug displays mesh edges and selected landmark/synthetic vertices.
- Save PNG exports the current canvas. The preview is mirrored; the saved image uses original camera orientation.
- Stop camera releases the stream and terminates inference. Cancel also works during model loading or permission prompts.

## GitHub Pages

Push the app to a GitHub repository with `main` as its default branch. In **Settings → Pages → Source**, choose **GitHub Actions**. The included workflow installs dependencies, fetches verified models, tests, builds, and publishes `dist`. Adjust the workflow branch if needed. The ignored reference checkout is not needed to build or deploy.

Vite uses `base: './'`; worker URLs, model URLs, and WASM URLs resolve relative to the deployed page, so both `https://user.github.io/repo/` and a root/custom-domain deployment work. For a manual deployment, publish the entire `dist` directory, including `models` and `wasm`. Webcam access requires HTTPS or localhost. No server headers for cross-origin isolation are required because WASM uses one thread.

## Implementation

`src/hrffa/` and the foundational runtime modules are adapted from the MIT-licensed [HRFFA browser demo](https://github.com/PINTO0309/High-Angle_Robust_Fast_FaceAlignment/tree/main/demo/web). The YOLOv9-n Wholebody34 detector finds heads (class 7); HRFFA hg0-256 estimates 68 landmarks from a square head crop with 5% padding. Initialization includes a real inference warmup. WebGPU is preferred; initialization/warmup failures restart in a fresh WASM worker. Use `?backend=wasm` to force fallback.

One primary head is selected using size and spatial continuity. Landmark subsets plus roll-aware synthetic skull points form a Delaunay mesh. Connectivity stays fixed while tracking to avoid triangle flips; motion-adaptive smoothing reduces jitter. Facets average four camera samples with reduced color precision and approximate depth-based lighting. The displayed camera frame and its inference result use the same snapshot to keep overlay alignment consistent.

## Limitations and manual checks

- This is a 2.5D effect, not a reconstructed skull or hair segmentation. Synthetic forehead points approximate the silhouette; profiles, occlusions, hair, and extreme expressions may stretch facets. Visibility labels are available from HRFFA but do not currently remove occluded facets.
- WASM can be substantially slower than WebGPU. Capture and rendering advance with inference, prioritizing alignment over webcam frame rate.
- Test a real webcam: allow/deny permission, stop/restart, move/rotate your head, leave/re-enter the frame, and introduce a second person. Selection uses spatial continuity, not identity recognition.
- Test both backgrounds, PNG alpha, detail changes, debug mode, resizing, and a deployed repository URL. Test Safari/Firefox fallback and Chrome/Edge WebGPU on target devices.
- Runtime GPU loss stops capture with a retry message; automatic fallback is performed during initialization and warmup only.

## Attribution and model terms

The copied/adapted HRFFA source is copyright (c) 2026 Katsuya Hyodo, MIT. The required notice is in `public/HRFFA-LICENSE.txt` and ships with the built app. `reference/hrffa/` remains unmodified and ignored. Visual reference images are development references and are not distributed by the app.

The selected detector is the upstream MIT YOLOv9 implementation; the CNN aligner derives from PP-HGNetV2/DEIMv2 (Apache-2.0). Upstream distinguishes its code license from model/backbone and training-data terms; consult the [upstream model/license notes](https://github.com/PINTO0309/High-Angle_Robust_Fast_FaceAlignment#7-license) before redistributing trained weights. The manifest preserves the exact upstream model names and hashes.

## Validation

`npm test` covers synthetic forehead coverage, increasing detail, stable topology, and smoothing. With Chrome installed and the dev server running, `npm run test:browser` runs a headless fake-webcam smoke check: actual WASM detector/aligner warmup and frame inference, canvas rendering with controlled landmarks, transparent alpha, and stream cleanup. This synthetic camera has no human face, so it does not validate real-person tracking quality. Set `APP_URL` to a deployed/preview URL (including `?backend=wasm` for deterministic fallback testing) to check production loading. Physical webcam and WebGPU performance still need device testing.

`npm run test:render` (Chrome and a running dev server required) checks matched camera/landmark frames through dropouts, sudden jumps, recovery, and prolonged loss across all five masks, three detail levels, and both backgrounds. It also checks control changes during recovery. Set `APP_URL` to another **dev server** URL if needed; this test imports the renderer source directly. During brief tracking loss the preview holds its last matched image and geometry for up to 500 ms; sustained loss clears the mask.
