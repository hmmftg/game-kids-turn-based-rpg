import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import type { QualityTier } from '../../domain/game/types.ts';
import {
  BlobShadow,
  CubicAnimal,
  CubicFigure,
  CubicLandmark,
  CubicProp,
  CubicScenery,
  GaitedAnimal,
} from './cubic.tsx';
import { CUBIC_MODELS } from './cubicModels.ts';
import { DoorDetail, type Xyz } from './details.tsx';
import type {
  AnimalProps,
  DetailLevel,
  LandmarkProps,
  ModelSet,
  PropProps,
  SceneryProps,
  SceneryVisualVariant,
} from './modelProvider.ts';
import { Ball } from './gltf/Ball.tsx';
import { Cat } from './gltf/Cat.tsx';
import { Bench } from './gltf/Bench.tsx';
import { Bush } from './gltf/Bush.tsx';
import { Crate } from './gltf/Crate.tsx';
import { Dog } from './gltf/Dog.tsx';
import { Duck } from './gltf/Duck.tsx';
import { Elephant } from './gltf/Elephant.tsx';
import { FarmPlot } from './gltf/FarmPlot.tsx';
import { Fence } from './gltf/Fence.tsx';
import { Fountain } from './gltf/Fountain.tsx';
import { HomeGate } from './gltf/HomeGate.tsx';
import { Koi } from './gltf/Koi.tsx';
import { Rock } from './gltf/Rock.tsx';
import { Rocks } from './gltf/Rocks.tsx';
import { Shop } from './gltf/Shop.tsx';
import { Streetlight } from './gltf/Streetlight.tsx';
import { TreeA } from './gltf/TreeA.tsx';
import { TreeB } from './gltf/TreeB.tsx';
import { TreeC } from './gltf/TreeC.tsx';
import {
  BALL_BOUNDS,
  BENCH_BOUNDS,
  BUSH_BOUNDS,
  CRATE_BOUNDS,
  DOG_BOUNDS,
  DUCK_BOUNDS,
  ELEPHANT_BOUNDS,
  FARM_BOUNDS,
  FENCE_BOUNDS,
  FOUNTAIN_FIT,
  HOME_GATE_FIT,
  KOI_BOUNDS,
  ROCK_BOUNDS,
  ROCKS_BOUNDS,
  SHOP_FIT,
  STREETLIGHT_BOUNDS,
  TREE_A_BOUNDS,
  TREE_B_BOUNDS,
  TREE_C_BOUNDS,
  fitToSize,
  type GlbExtents,
  type GlbFit,
} from './gltf/placement.ts';

/**
 * GLB model set — same `ModelSet` contract as `CUBIC_MODELS` so the hub and
 * quest logic never see the difference.
 *
 * Landmarks (`home-gate`, `shop`, `fountain`), props (`ball`, `crate`) and
 * critters (`duck`, `dog`) map to committed KayKit models; `square`/`garden`,
 * every Figure and the remaining variants delegate to the cubic components.
 * Each GLB subtree is wrapped in Suspense + an error boundary whose fallback
 * is the equivalent cubic model — a failed or pending fetch never leaves a
 * hole in the world.
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
  pendingFallback,
  children,
}: {
  readonly fit: GlbFit;
  readonly fallback: ReactNode;
  /** Lighter stand-in shown only while the fetch resolves (errors get `fallback`). */
  readonly pendingFallback?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <GltfErrorBoundary fallback={fallback}>
      <Suspense fallback={pendingFallback ?? fallback}>
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

/**
 * GLB props keep the same slot contract: the file model mounts where the
 * cubic prop's base box would be (its `scale` is the target size), still
 * wrapped in the callers' ReactiveProp panel, so tap semantics are unchanged.
 * Variants without a truthful GLB match stay cubic.
 */
function GltfProp(props: PropProps) {
  const { position, variant, scale = 0.4 } = props;
  const zero = { x: 0, z: 0 };
  const cubicFallback = <CubicProp {...props} position={zero} />;
  return (
    <group position={[position.x, 0, position.z]} dispose={null}>
      {variant === 'ball' ? (
        <Gltf fit={fitToSize(BALL_BOUNDS, scale)} fallback={cubicFallback}>
          <Ball />
        </Gltf>
      ) : variant === 'crate' ? (
        <Gltf fit={fitToSize(CRATE_BOUNDS, scale)} fallback={cubicFallback}>
          <Crate />
        </Gltf>
      ) : (
        <CubicProp {...props} position={zero} />
      )}
    </group>
  );
}

/**
 * GLB critters keep the ambient contract: the shared `GaitedAnimal` shell
 * mounts the gait root only while moving/settling, and a `gait-*` joint
 * wraps the model so the whole body moves like the cubic species' steps —
 * `waddle` rocks ground walkers, `swish` sways the swimmer (the cubic fish
 * uses the same joint for its tail).
 * Sized to read next to the cubic cat (~0.85 tall): duck 0.55, dog 0.7,
 * fish ~0.9 long (the cubic fish is ~0.8).
 * Variants without a GLB — or below their `minDetail` gate — stay cubic.
 */
const KOI_FIT: GlbFit = (() => {
  const fit = fitToSize(KOI_BOUNDS, 0.9, { rotationY: Math.PI / 2 });
  // Fish origin = the waterline, not the ground: recenter vertically so the
  // koi rides half-submerged like the cubic fish.
  const midY = (KOI_BOUNDS.min[1] + KOI_BOUNDS.max[1]) / 2;
  return { ...fit, position: [fit.position[0], -midY * fit.scale, fit.position[2]] };
})();

const CAT_BOUNDS: GlbExtents = {
  min: [-29.122, -0.006, -3.873],
  max: [14.301, 20.905, 3.873],
};

const ANIMAL_GLBS: Partial<
  Record<
    AnimalProps['variant'],
    {
      readonly fit: GlbFit;
      readonly Model: (props: object) => ReactNode;
      readonly gait: string;
      /** Earliest detail level that mounts the GLB (else cubic). */
      readonly minDetail?: DetailLevel;
    }
  >
> = {
  duck: { fit: fitToSize(DUCK_BOUNDS, 0.55), Model: Duck, gait: 'gait-waddle' },
  dog: { fit: fitToSize(DOG_BOUNDS, 0.7), Model: Dog, gait: 'gait-waddle' },
  cat: { fit: fitToSize(CAT_BOUNDS, 0.85), Model: Cat, gait: 'gait-waddle', minDetail: 6 },
  fish: { fit: KOI_FIT, Model: Koi, gait: 'gait-swish', minDetail: 6 },
  // 1,199 tris + a double-sided material — very-high only, like the koi.
  // The biggest critter: 1.6 trunk-to-tail ≈ 0.95 tall at the shoulder.
  elephant: {
    fit: fitToSize(ELEPHANT_BOUNDS, 1.6, { rotationY: -Math.PI / 2 }),
    Model: Elephant,
    gait: 'gait-waddle',
    minDetail: 6,
  },
};

function GltfAnimal(props: AnimalProps) {
  const entry = ANIMAL_GLBS[props.variant];
  if (!entry || (entry.minDetail !== undefined && (props.detailLevel ?? 0) < entry.minDetail))
    return <CubicAnimal {...props} />;
  const fallback = <CubicAnimal {...props} />;
  // Pending fetches get a level-1 silhouette: still the same animal, but ~40
  // fewer objects than the full-detail fallback — the transient stays under
  // the object-count ceiling while two critter GLBs resolve at once.
  const pending = <CubicAnimal {...props} detailLevel={1} />;
  return (
    <GaitedAnimal moving={props.moving ?? false}>
      <group name={entry.gait}>
        <Gltf fit={entry.fit} fallback={fallback} pendingFallback={pending}>
          <entry.Model />
        </Gltf>
      </group>
    </GaitedAnimal>
  );
}

/**
 * GLB scenery — the decoration slots whose kind names a shipped model.
 * `fitToSize` reads the slot's `scale` as the target size on the largest
 * axis, identical to `CubicScenery`'s scale semantics, so a swapped kind
 * occupies the same footprint on every tier. Static pieces get no
 * pendingFallback: the decoration simply pops in once fetched, which is
 * what the cubic pending look would draw anyway minus the object cost.
 */
const SCENERY_GLBS: Record<
  SceneryVisualVariant,
  {
    readonly bounds: GlbExtents;
    readonly Model: (props: object) => ReactNode;
    /**
     * Detail level at which the slot upgrades to the GLB. Most scenery swaps
     * as soon as the gltf ModelSet is active (detail 5+); the farm plot — the
     * heaviest scenery file — waits for very-high so `high` keeps the cubic
     * plot and stays under its triangle ceiling.
     */
    readonly minDetail?: DetailLevel;
  }
> = {
  'tree-a': { bounds: TREE_A_BOUNDS, Model: TreeA },
  'tree-b': { bounds: TREE_B_BOUNDS, Model: TreeB },
  'tree-c': { bounds: TREE_C_BOUNDS, Model: TreeC },
  rocks: { bounds: ROCKS_BOUNDS, Model: Rocks },
  farm: { bounds: FARM_BOUNDS, Model: FarmPlot, minDetail: 6 },
  fence: { bounds: FENCE_BOUNDS, Model: Fence, minDetail: 6 },
  // Textured-pack picks — very-high only: high's triangle headroom is ~146
  // and even these small swaps would tip it over.
  bush: { bounds: BUSH_BOUNDS, Model: Bush, minDetail: 6 },
  rock: { bounds: ROCK_BOUNDS, Model: Rock, minDetail: 6 },
  bench: { bounds: BENCH_BOUNDS, Model: Bench, minDetail: 6 },
  streetlight: { bounds: STREETLIGHT_BOUNDS, Model: Streetlight, minDetail: 6 },
};

function GltfScenery(props: SceneryProps) {
  const { variant, scale = 1 } = props;
  const entry = SCENERY_GLBS[variant];
  const fallback = <CubicScenery {...props} />;
  if (entry.minDetail !== undefined && (props.detailLevel ?? 0) < entry.minDetail) return fallback;
  return (
    // Static scenery pops in once fetched — no pending stand-in (the cubic
    // fallback stays the error path). Keeping Suspense empty also holds the
    // load-transient object count under the ceiling.
    <Gltf fit={fitToSize(entry.bounds, scale)} fallback={fallback} pendingFallback={<></>}>
      <entry.Model />
    </Gltf>
  );
}

export const GLTF_MODELS: ModelSet = {
  kind: 'gltf',
  Figure: CubicFigure,
  Landmark: GltfLandmark,
  Prop: GltfProp,
  Animal: GltfAnimal,
  Scenery: GltfScenery,
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
