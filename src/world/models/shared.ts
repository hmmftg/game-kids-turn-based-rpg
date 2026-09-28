import * as THREE from 'three';

/**
 * Shared geometries for every world model. Decorative detail reuses these
 * instead of allocating per-mesh geometry — never create geometries or
 * materials inside a component render.
 */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
export const PLANE = new THREE.PlaneGeometry(1, 1);
export const CIRCLE = new THREE.CircleGeometry(1, 16);
export const SPHERE = new THREE.SphereGeometry(0.5, 12, 8);

/**
 * Blob-shadow material shared by every figure/landmark shadow disc.
 */
export const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#000000',
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
});

/**
 * Shared-resource lifetime contract.
 *
 * Everything in this module is owned by the module itself: `BOX`, `CYLINDER`,
 * `PLANE`, `CIRCLE`, `SHADOW_MATERIAL`, and every `MeshLambertMaterial` handed
 * out by `sharedLambert` live for the whole app session and are deliberately
 * reused by many meshes.
 *
 * The world canvas is intentionally remounted during parent-area and
 * orientation transitions. To keep one mesh's unmount from disposing a
 * resource the other meshes still use, subtrees built exclusively from these
 * shared resources carry `dispose={null}` at their boundary (see the model
 * components and the decoration groups in `Hub.tsx`). Locally owned
 * JSX-created resources (e.g. the hotspot/destination ring geometry) are NOT
 * covered by that boundary and keep normal R3F disposal.
 */

/**
 * Module-level material registry: the same color always resolves to the same
 * `MeshLambertMaterial` instance across the whole scene, so repeated decorative
 * details (windows, stones, leaves) do not multiply material objects.
 */
const LAMBERT_CACHE = new Map<string, THREE.MeshLambertMaterial>();

export function sharedLambert(color: string): THREE.MeshLambertMaterial {
  let material = LAMBERT_CACHE.get(color);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color });
    LAMBERT_CACHE.set(color, material);
  }
  return material;
}

/** Test/perf instrumentation: how many material instances the registry holds. */
export function sharedMaterialCount(): number {
  return LAMBERT_CACHE.size;
}

/**
 * Gradient sky dome: vertex-colored inverted sphere, MeshBasic so it ignores
 * lights and fog. Pure geometry math — safe to build at module level.
 */
const SKY_GEOMETRY = (() => {
  const geometry = new THREE.SphereGeometry(80, 24, 12);
  const top = new THREE.Color('#8fc7ea');
  const horizon = new THREE.Color('#f7ecd6');
  const position = geometry.attributes.position;
  if (!position) return geometry;
  const colors: number[] = [];
  const vertex = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const t = THREE.MathUtils.clamp((vertex.y + 12) / 55, 0, 1);
    color.copy(horizon).lerp(top, t);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
})();

const SKY_MATERIAL = new THREE.MeshBasicMaterial({
  vertexColors: true,
  side: THREE.BackSide,
  fog: false,
  depthWrite: false,
});

export function skyDomeResources(): {
  geometry: THREE.SphereGeometry;
  material: THREE.MeshBasicMaterial;
} {
  return { geometry: SKY_GEOMETRY, material: SKY_MATERIAL };
}

/**
 * Ground material with a procedurally drawn CanvasTexture (warm sand with a
 * faint speckle and tile grid). Lazily created on first use — module load may
 * run where no DOM canvas exists, in which case it degrades to the flat color
 * the scene used before.
 */
let groundMaterial: THREE.MeshLambertMaterial | null = null;

export function sharedGroundMaterial(): THREE.MeshLambertMaterial {
  if (groundMaterial) return groundMaterial;
  const material = new THREE.MeshLambertMaterial({ color: '#efe0bd' });
  groundMaterial = material;
  if (typeof document === 'undefined') return material;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return material;

  ctx.fillStyle = '#efe0bd';
  ctx.fillRect(0, 0, 256, 256);
  // Deterministic speckle (simple LCG — stable output, no Math.random).
  let seed = 1337;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 420; i++) {
    const shade = rand() > 0.5 ? 'rgba(120,95,60,0.10)' : 'rgba(255,250,230,0.16)';
    ctx.fillStyle = shade;
    ctx.fillRect(Math.floor(rand() * 256), Math.floor(rand() * 256), 2, 2);
  }
  ctx.strokeStyle = 'rgba(140,110,70,0.10)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  material.map = texture;
  material.needsUpdate = true;
  return material;
}

/** Small fixed palette for decorative detail — harmonious, never noisy. */
export const DETAIL_COLORS = {
  frame: '#f5ead2',
  pane: '#a9d4e8',
  door: '#8a5a33',
  sign: '#efe6d2',
  signPost: '#7a5230',
  leaf: '#4f8f4f',
  leafDark: '#3f743f',
  flower: '#e88bb0',
  stone: '#b8b2a4',
  soil: '#6b4a2e',
  awning: '#c96f8d',
  trim: '#e8cfa5',
  dome: '#7aa8c9',
  domeAccent: '#f2d98f',
  water: '#7cc4de',
} as const;

export type DetailColor = keyof typeof DETAIL_COLORS;
