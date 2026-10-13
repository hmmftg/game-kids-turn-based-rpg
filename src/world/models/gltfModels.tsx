import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import type { QualityTier } from '../../domain/game/types.ts';
import { BlobShadow, CubicAnimal, CubicFigure, CubicLandmark, CubicProp } from './cubic.tsx';
import { CUBIC_MODELS } from './cubicModels.ts';
import { DoorDetail, type Xyz } from './details.tsx';
import type { LandmarkProps, ModelSet } from './modelProvider.ts';
import { Fountain } from './gltf/Fountain.tsx';
import { HomeGate } from './gltf/HomeGate.tsx';
import { Shop } from './gltf/Shop.tsx';
import { FOUNTAIN_FIT, HOME_GATE_FIT, SHOP_FIT, type LandmarkFit } from './gltf/placement.ts';

/**
 * GLB model set — same `ModelSet` contract as `CUBIC_MODELS` so the hub and
 * quest logic never see the difference.
 *
 * Only landmarks get real GLB geometry for now: `home-gate`, `shop` and
 * `fountain` map to committed KayKit models; `square`/`garden` and every
 * Figure/Prop/Animal delegate to the cubic components. Each GLB subtree is
 * wrapped in Suspense + an error boundary whose fallback is the equivalent
 * cubic landmark — a failed or pending fetch never leaves a hole in the
 * world.
 */

/** Scene-local boundary: a GLB that fails to parse/load falls back to cubic. */
class GltfErrorBoundary extends Component<
  { readonly fallback: ReactNode; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    console.error('gltf-landmark', error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The canvas renders on demand (`frameloop="demand"`): when the suspended GLB
 * resolves, its commit must invalidate or the landmark stays invisible until
 * the next unrelated redraw.
 */
function InvalidateOnResolve() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [invalidate]);
  return null;
}

/** Suspense+boundary + the measured fit transform around one GLB component. */
function Gltf({
  fit,
  fallback,
  children,
}: {
  readonly fit: LandmarkFit;
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <GltfErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <InvalidateOnResolve />
        <group scale={fit.scale} position={fit.position} rotation={[0, fit.rotationY, 0]}>
          {children}
        </group>
      </Suspense>
    </GltfErrorBoundary>
  );
}

/**
 * Explicit interaction proxy for the GLB home-gate (acceptance requirement):
 * the KayKit house is a single multi-material mesh — it has no door node to
 * animate — so the same `DoorDetail` the cubic variant uses provides both
 * the tap surface (`reactive-door-home-gate`) and the door-swing flourish.
 * Positioned where the model's actual door lands after the fit: the doorway
 * sits at local (x≈+0.44, z≈-0.6 wall) on the pre-rotation mesh, so after
 * `rotationY: π` and scale ≈1.538 it is landmark-local (-0.68, 0, 0.41);
 * +0.03 keeps the slab proud of the wall face.
 */
const HOME_GATE_DOOR: Xyz = [-0.68, 0, 0.44];

function GltfLandmark(props: LandmarkProps) {
  const { position, variant } = props;
  const zero = { x: 0, z: 0 };
  const cubicFallback = <CubicLandmark {...props} position={zero} />;
  return (
    <group position={[position.x, 0, position.z]} dispose={null}>
      {variant === 'home-gate' ? (
        <>
          <BlobShadow radius={1.0} />
          <Gltf fit={HOME_GATE_FIT} fallback={cubicFallback}>
            <HomeGate />
          </Gltf>
          <DoorDetail position={HOME_GATE_DOOR} reactive subject="door-home-gate" />
        </>
      ) : variant === 'shop' ? (
        <>
          <BlobShadow radius={1.0} />
          <Gltf fit={SHOP_FIT} fallback={cubicFallback}>
            <Shop />
          </Gltf>
        </>
      ) : variant === 'fountain' ? (
        <>
          <BlobShadow radius={1.0} />
          <Gltf fit={FOUNTAIN_FIT} fallback={cubicFallback}>
            <Fountain />
          </Gltf>
        </>
      ) : (
        <CubicLandmark {...props} position={zero} />
      )}
    </group>
  );
}

export const GLTF_MODELS: ModelSet = {
  kind: 'gltf',
  Figure: CubicFigure,
  Landmark: GltfLandmark,
  Prop: CubicProp,
  Animal: CubicAnimal,
};

/**
 * Tier gate: GLBs are enabled on `high`/`very-high` only. The spec asked for
 * normal+, but `scripts/measure-world.ts` (SwiftShader, 3-sample max) shows
 * the cubic world already consumes ~99.6% of normal's triangle ceiling
 * (34,360 / 34,500) — no added geometry fits durably there. very-low/low
 * additionally must never initiate a `useGLTF` fetch, and because the GLB
 * components never mount on those tiers, none happens. Revisit normal when
 * the world's baseline headroom grows or the ceiling is renegotiated.
 */
export function modelsForTier(tier: QualityTier): ModelSet {
  return tier === 'high' || tier === 'very-high' ? GLTF_MODELS : CUBIC_MODELS;
}
