/**
 * Dev-only GLB contact sheet: render candidate models in a labeled grid to
 * judge silhouette/color readability before they enter public/models/.
 *
 * Spins up a scratch vite dev server (so `three`/`GLTFLoader` resolve through
 * the normal transform pipeline), serves the GLBs straight from a source dir,
 * and screenshots the grid.
 *
 * Usage: node --experimental-strip-types scripts/model-shot.ts <dir-with-glbs> [out.png]
 * Requires chromium (SwiftShader is fine).
 */
import { createServer } from 'vite';
import { createServer as createHttpServer, type Server } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const dir = resolve(process.argv[2] ?? '.');
const out = resolve(process.argv[3] ?? '/tmp/model-sheet.png');
const models = process.argv.slice(4);

const VIEWER_HTML = 'model-sheet.tmp.html';
const VIEWER_TS = 'model-sheet.tmp.ts';

writeFileSync(
  VIEWER_TS,
  `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const params = new URLSearchParams(location.search);
const names = params.get('m')!.split(',');
const cols = Math.ceil(Math.sqrt(names.length));
const rows = Math.ceil(names.length / cols);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc8e8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 8, 6);
scene.add(sun);
scene.add(new THREE.GridHelper(cols * 4, cols * 8, 0x557755, 0x88aa77));
const loader = new GLTFLoader();
let tallest = 1;
for (const [i, name] of names.entries()) {
  const g = await loader.loadAsync('/models/' + name + '.glb');
  const node = g.scene;
  node.traverse((o) => {
    // Inspection render: some sources need doubleSided (auto-rigged shards)
    // — force it so the sheet shows every face like the DS material variant.
    if (o.isMesh && o.material) o.material.side = THREE.DoubleSide;
  });
  const x = (i % cols - (cols - 1) / 2) * 3.2;
  const z = (Math.floor(i / cols) - (rows - 1) / 2) * 3.2;
  node.position.set(x, 0, z);
  scene.add(node);
  const bb = new THREE.Box3().setFromObject(node);
  tallest = Math.max(tallest, bb.max.y - bb.min.y);
}
const aspect = innerWidth / innerHeight;
const halfH = Math.max(cols, rows) * 2.2 + tallest;
const camera = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, 0.1, 300);
camera.position.set(6, 7, 10);
camera.lookAt(0, 0.4, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
renderer.render(scene, camera);
document.title = 'READY';
`,
);
writeFileSync(
  VIEWER_HTML,
  `<!doctype html><html><body style="margin:0"><script type="module" src="/${VIEWER_TS}"></script></body></html>`,
);

// Static file server for the candidate GLBs — vite dev doesn't serve /tmp.
const glbServer: Server = createHttpServer((req, res) => {
  const p = join(dir, basename(req.url ?? ''));
  if (existsSync(p)) {
    res.setHeader('content-type', 'model/gltf-binary');
    res.end(readFileSync(p));
  } else {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise<void>((r) => glbServer.listen(0, r));
const glbPort = (glbServer.address() as { port: number }).port;

const vite = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: {
    port: 0,
    strictPort: false,
    // Route /models/* to the scratch GLB dir instead of public/.
    proxy: {
      '/models': {
        target: `http://localhost:${glbPort}`,
        rewrite: (p) => p.replace('/models', ''),
      },
    },
  },
});
await vite.listen();
const port = vite.httpServer!.address() as unknown as { port: number };

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text());
});
const list = models.length
  ? models
  : 'ball,crate,duck,dog,tree-a,tree-b,tree-c,rocks,rocks-small,farm-plot,fence,path-cobbled,path-dirt';
await page.goto(`http://localhost:${port.port}/${VIEWER_HTML}?m=${list}`);
await page.waitForFunction(() => document.title === 'READY', { timeout: 30_000 });
mkdirSync(resolve(out, '..'), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
await vite.close();
glbServer.close();
rmSync(VIEWER_HTML, { force: true });
rmSync(VIEWER_TS, { force: true });
console.log('wrote', out);
