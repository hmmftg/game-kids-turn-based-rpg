import {
  findPath,
  type Anchor,
  type AnchorId,
  type GraphSource,
  type MapId,
  type MapTransition,
  type WorldMap,
} from 'waypoint-rpg-core';
import type { ComponentType } from 'react';
import type { DemoRuntime } from './runtime.js';

export type SceneCameraConfiguration =
  { readonly kind: 'perspective' } | { readonly kind: 'orthographic' };

export interface SceneComponentProps {
  readonly entryAnchorId: AnchorId;
  readonly runtime: DemoRuntime;
  readonly presentation?: {
    readonly lanternAccent: boolean;
    readonly guardianAction: 'idle' | 'move' | 'interact' | 'combat' | 'defeat';
    readonly guardianActionRevision: number;
  };
}

export interface SceneResource {
  readonly Component: ComponentType<SceneComponentProps>;
  /** Releases loader-owned resources; R3F owns and disposes mounted objects. */
  dispose(): void;
}

export interface SceneDefinition {
  readonly map: WorldMap;
  readonly graph: GraphSource;
  readonly camera: SceneCameraConfiguration;
  readonly load: (signal: AbortSignal) => Promise<SceneResource>;
}

export interface RegisteredScene {
  readonly definition: SceneDefinition;
  readonly resource: SceneResource;
  readonly entryAnchorId: AnchorId;
}

export interface SceneHostSnapshot {
  readonly active: RegisteredScene | null;
  readonly pendingMapId: MapId | null;
  readonly currentAnchorId: AnchorId | null;
  readonly error: string | null;
}

export type SceneTransitionResult =
  | { readonly status: 'committed' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'invalid'; readonly error: string };

export interface SceneRegistry {
  getScene(mapId: MapId): SceneDefinition;
  getTransition(transitionId: MapTransition['id']): MapTransition;
}

function anchorsById(scene: SceneDefinition): Map<AnchorId, Anchor> {
  return new Map(scene.graph.anchors.map((anchor) => [anchor.id, anchor]));
}

function assertScene(scene: SceneDefinition): void {
  if (scene.graph.anchors.length === 0) {
    throw new Error(`Scene ${scene.map.id} has no anchors.`);
  }
  const anchors = anchorsById(scene);
  if (anchors.size !== scene.graph.anchors.length) {
    throw new Error(`Scene ${scene.map.id} contains duplicate anchors.`);
  }
  for (const anchor of scene.graph.anchors) {
    if (anchor.mapId !== scene.map.id) {
      throw new Error(`Anchor ${anchor.id} does not belong to scene ${scene.map.id}.`);
    }
  }
  const spawn = anchors.get(scene.map.spawnAnchorId);
  if (!spawn?.walkable) {
    throw new Error(`Scene ${scene.map.id} has an unknown or non-walkable spawn anchor.`);
  }
}

export function createSceneRegistry(
  scenes: readonly SceneDefinition[],
  transitions: readonly MapTransition[],
): SceneRegistry {
  const byMap = new Map<MapId, SceneDefinition>();
  for (const scene of scenes) {
    assertScene(scene);
    if (byMap.has(scene.map.id)) throw new Error(`Duplicate scene id: ${scene.map.id}.`);
    byMap.set(scene.map.id, scene);
  }

  const byTransition = new Map<MapTransition['id'], MapTransition>();
  for (const route of transitions) {
    if (byTransition.has(route.id)) throw new Error(`Duplicate transition id: ${route.id}.`);
    const source = byMap.get(route.fromMap);
    const destination = byMap.get(route.toMap);
    if (!source) throw new Error(`Unknown scene in transition source: ${route.fromMap}.`);
    if (!destination) throw new Error(`Unknown scene in transition target: ${route.toMap}.`);

    const sourceAnchor = anchorsById(source).get(route.fromAnchor);
    if (!sourceAnchor?.walkable) {
      throw new Error(`Unknown or non-walkable source anchor: ${route.fromAnchor}.`);
    }
    const destinationAnchor = anchorsById(destination).get(route.toAnchor);
    if (!destinationAnchor?.walkable) {
      throw new Error(`Unknown or non-walkable destination anchor: ${route.toAnchor}.`);
    }
    if (findPath(source.graph, source.map.spawnAnchorId, route.fromAnchor).length === 0) {
      throw new Error(`Transition ${route.id} has no path to its source anchor.`);
    }
    byTransition.set(route.id, route);
  }

  return {
    getScene(mapId) {
      const scene = byMap.get(mapId);
      if (!scene) throw new Error(`Unknown scene: ${mapId}.`);
      return scene;
    },
    getTransition(transitionId) {
      const route = byTransition.get(transitionId);
      if (!route) throw new Error(`Unknown transition: ${transitionId}.`);
      return route;
    },
  };
}

export class SceneHost {
  private snapshot: SceneHostSnapshot = {
    active: null,
    pendingMapId: null,
    currentAnchorId: null,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private pending: AbortController | null = null;
  private disposed = false;

  constructor(private readonly registry: SceneRegistry) {}

  getSnapshot = (): SceneHostSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(mapId: MapId, entryAnchorId?: AnchorId): Promise<SceneTransitionResult> {
    if (this.disposed) return { status: 'cancelled' };
    let definition: SceneDefinition;
    try {
      definition = this.registry.getScene(mapId);
    } catch (error) {
      return this.invalid(error);
    }
    const selectedAnchorId = entryAnchorId ?? definition.map.spawnAnchorId;
    const selectedAnchor = anchorsById(definition).get(selectedAnchorId);
    if (!selectedAnchor || selectedAnchor.mapId !== definition.map.id) {
      return this.invalid(
        new Error(`Unknown or wrong-map start anchor ${selectedAnchorId} for ${mapId}.`),
      );
    }
    if (!selectedAnchor.walkable) {
      return this.invalid(new Error(`Start anchor ${selectedAnchorId} is not walkable.`));
    }
    return this.load(definition, selectedAnchorId);
  }

  async transition(transitionId: MapTransition['id']): Promise<SceneTransitionResult> {
    if (this.disposed) return { status: 'cancelled' };
    const active = this.snapshot.active;
    if (!active) return this.invalid(new Error('No scene is active.'));

    let route: MapTransition;
    let destination: SceneDefinition;
    try {
      route = this.registry.getTransition(transitionId);
      if (route.fromMap !== active.definition.map.id) {
        throw new Error(`Transition ${transitionId} does not leave the active scene.`);
      }
      const currentAnchorId = this.snapshot.currentAnchorId ?? active.entryAnchorId;
      if (findPath(active.definition.graph, currentAnchorId, route.fromAnchor).length === 0) {
        throw new Error(`There is no path from ${currentAnchorId} to ${route.fromAnchor}.`);
      }
      destination = this.registry.getScene(route.toMap);
    } catch (error) {
      return this.invalid(error);
    }

    return this.load(destination, route.toAnchor);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.pending?.abort();
    this.pending = null;
    const active = this.snapshot.active;
    this.snapshot = { active: null, pendingMapId: null, currentAnchorId: null, error: null };
    this.listeners.clear();
    active?.resource.dispose();
  }

  private async load(
    definition: SceneDefinition,
    entryAnchorId: AnchorId,
  ): Promise<SceneTransitionResult> {
    this.pending?.abort();
    const controller = new AbortController();
    const generation = ++this.generation;
    this.pending = controller;
    this.publish({ ...this.snapshot, pendingMapId: definition.map.id, error: null });

    try {
      const resource = await definition.load(controller.signal);
      if (this.disposed || generation !== this.generation) {
        resource.dispose();
        return { status: 'cancelled' };
      }

      const previous = this.snapshot.active;
      const active = { definition, resource, entryAnchorId };
      this.pending = null;
      this.publish({ active, pendingMapId: null, currentAnchorId: entryAnchorId, error: null });
      if (previous && previous.resource !== resource) previous.resource.dispose();
      return { status: 'committed' };
    } catch (error) {
      if (this.disposed || generation !== this.generation) return { status: 'cancelled' };
      const message = error instanceof Error ? error.message : String(error);
      this.pending = null;
      this.publish({ ...this.snapshot, pendingMapId: null, error: message });
      return { status: 'failed', error: message };
    }
  }

  private invalid(error: unknown): SceneTransitionResult {
    const message = error instanceof Error ? error.message : String(error);
    this.publish({ ...this.snapshot, error: message });
    return { status: 'invalid', error: message };
  }

  private publish(snapshot: SceneHostSnapshot): void {
    if (this.disposed) return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
