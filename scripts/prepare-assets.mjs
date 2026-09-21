import { mkdirSync, copyFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
const lock = JSON.parse(readFileSync(new URL('../models.lock.json', import.meta.url)));
mkdirSync('public/models', { recursive: true });
mkdirSync('public/wasm/ort', { recursive: true });
for (const { name } of lock.files) {
  if (!existsSync(`models/${name}`)) throw new Error(`Missing ${name}. Run npm run fetch:models first.`);
  copyFileSync(`models/${name}`, `public/models/${name}`);
}
for (const name of readdirSync('node_modules/onnxruntime-web/dist')) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name)) copyFileSync(`node_modules/onnxruntime-web/dist/${name}`, `public/wasm/ort/${name}`);
}
console.log('Staged local models and ONNX runtime assets.');
