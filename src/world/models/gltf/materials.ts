import { MeshLambertMaterial } from 'three';

/**
 * Single shared material for every shipped GLB.
 *
 * All models in `public/models/` go through `scripts/convert-model.ts
 * --vcolor`: each primitive's flat KayKit baseColorFactor is baked into a
 * COLOR_0 vertex attribute and the file's materials are dropped entirely.
 * One white `vertexColors` Lambert therefore shades every GLB mesh — the
 * whole gltf ModelSet costs ONE material instance, and the per-tier
 * materials budget stays flat no matter how many models mount.
 *
 * If a regenerated component ever needs a distinct material, the fix is in
 * the conversion step — never rebind the file's own materials here.
 */
export const VERTEX_LAMBERT = new MeshLambertMaterial({ vertexColors: true });
