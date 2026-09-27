import * as THREE from 'three';

/**
 * Shared geometries for every world model. Decorative detail reuses these
 * instead of allocating per-mesh geometry — never create geometries or
 * materials inside a component render.
 */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
export const PLANE = new THREE.PlaneGeometry(1, 1);

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
  water: '#7cc4de',
} as const;

export type DetailColor = keyof typeof DETAIL_COLORS;
