import { useEffect, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { AnchorId, NpcId } from '../domain/game/types.ts';
import type { MapId } from '../domain/world/types.ts';
import type { WorldBuilderDocument } from '../domain/worldbuilder/document.ts';
import { sharedLambert } from '../world/models/shared.ts';
import { noRaycast } from '../world/models/raycast.ts';

/** What the inspector is showing — every selectable thing in the document. */
export type BuilderSelection =
  | { readonly kind: 'map'; readonly id: MapId }
  | { readonly kind: 'area'; readonly id: string }
  | { readonly kind: 'anchor'; readonly id: AnchorId }
  | { readonly kind: 'edge'; readonly from: AnchorId; readonly to: AnchorId }
  | { readonly kind: 'transition'; readonly id: string }
  | { readonly kind: 'placement'; readonly npcId: NpcId };

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 16);
const SPHERE = new THREE.SphereGeometry(0.3, 12, 8);

const COLOR = {
  walkable: '#4caf50',
  blocked: '#8a8a8a',
  spawn: '#f0b429',
  transition: '#9c6ade',
  edge: '#c8b78f',
  npc: '#4a90d9',
  selected: '#ff7f2a',
  areaFill: '#4a90d9',
  areaBorder: '#ffffff',
};

function isSelected(selection: BuilderSelection | null, kind: string, id: string): boolean {
  if (!selection || selection.kind !== kind) return false;
  return 'id' in selection && selection.id === id;
}

/**
 * Authoring overlays drawn over the preview scene in Edit mode: map/area
 * bounds, the anchor graph, transitions, and home NPC placements — all read
 * from the document, so edits repaint immediately. Anchors are drag-to-move.
 */
export function BuilderOverlays({
  doc,
  mapId,
  selection,
  onSelect,
  onDragAnchor,
}: {
  readonly doc: WorldBuilderDocument;
  readonly mapId: MapId;
  readonly selection: BuilderSelection | null;
  readonly onSelect: (selection: BuilderSelection) => void;
  readonly onDragAnchor: (anchorId: AnchorId, x: number, z: number) => void;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const dragging = useRef<AnchorId | null>(null);

  // Anchor drag: raycast pointer moves onto the ground plane and report the
  // new world-space position — same technique as CameraRig's pan.
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const onMove = (event: PointerEvent) => {
      if (dragging.current === null) return;
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(ground, hit) !== null) {
        onDragAnchor(dragging.current, Math.round(hit.x * 10) / 10, Math.round(hit.z * 10) / 10);
      }
    };
    const onUp = () => {
      dragging.current = null;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl, camera, onDragAnchor]);

  const anchors = doc.anchors.filter((anchor) => anchor.mapId === mapId);
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const areas = doc.areas.filter((area) => area.mapId === mapId);
  const map = doc.maps.find((entry) => entry.id === mapId);
  const transitions = doc.transitions.filter((t) => t.fromMap === mapId);
  const placements = doc.npcPlacements.filter((p) => anchorById.has(p.anchorId));
  const edges = doc.edges.filter((e) => anchorById.has(e.from) && anchorById.has(e.to));

  const pick = (selection: BuilderSelection) => (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 6) return;
    event.stopPropagation();
    onSelect(selection);
  };

  return (
    <group dispose={null}>
      {/* Map bounds outline */}
      {map ? (
        <group onClick={pick({ kind: 'map', id: mapId })} position={[0, 0.005, 0]}>
          <mesh
            geometry={BOX}
            material={sharedLambert(
              isSelected(selection, 'map', mapId) ? COLOR.selected : '#000000',
            )}
            position={[
              (map.bounds.minX + map.bounds.maxX) / 2,
              0,
              (map.bounds.minZ + map.bounds.maxZ) / 2,
            ]}
            scale={[map.bounds.maxX - map.bounds.minX, 0.02, map.bounds.maxZ - map.bounds.minZ]}
          />
        </group>
      ) : null}

      {/* Area bounds — translucent fill plus a bright rim */}
      {areas.map((area) => {
        const w = area.bounds.maxX - area.bounds.minX;
        const h = area.bounds.maxZ - area.bounds.minZ;
        const cx = (area.bounds.minX + area.bounds.maxX) / 2;
        const cz = (area.bounds.minZ + area.bounds.maxZ) / 2;
        const sel = isSelected(selection, 'area', area.id);
        const fill = new THREE.MeshBasicMaterial({
          color: sel ? COLOR.selected : COLOR.areaFill,
          transparent: true,
          opacity: sel ? 0.28 : 0.12,
          depthWrite: false,
        });
        const rim = sharedLambert(sel ? COLOR.selected : COLOR.areaBorder);
        return (
          <group key={area.id} position={[0, 0.03, 0]}>
            <mesh geometry={BOX} material={fill} position={[cx, 0, cz]} scale={[w, 0.02, h]}></mesh>
            <mesh
              geometry={BOX}
              material={rim}
              position={[cx, 0.01, area.bounds.minZ]}
              scale={[w, 0.03, 0.08]}
              onClick={pick({ kind: 'area', id: area.id })}
            />
            <mesh
              geometry={BOX}
              material={rim}
              position={[cx, 0.01, area.bounds.maxZ]}
              scale={[w, 0.03, 0.08]}
              onClick={pick({ kind: 'area', id: area.id })}
            />
            <mesh
              geometry={BOX}
              material={rim}
              position={[area.bounds.minX, 0.01, cz]}
              scale={[0.08, 0.03, h]}
              onClick={pick({ kind: 'area', id: area.id })}
            />
            <mesh
              geometry={BOX}
              material={rim}
              position={[area.bounds.maxX, 0.01, cz]}
              scale={[0.08, 0.03, h]}
              onClick={pick({ kind: 'area', id: area.id })}
            />
          </group>
        );
      })}

      {/* Edges between same-map anchors */}
      {edges.map((edge) => {
        const from = anchorById.get(edge.from);
        const to = anchorById.get(edge.to);
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        const sel =
          selection?.kind === 'edge' && selection.from === edge.from && selection.to === edge.to;
        return (
          <mesh
            key={`${edge.from}:${edge.to}`}
            geometry={BOX}
            material={sharedLambert(sel ? COLOR.selected : COLOR.edge)}
            position={[(from.x + to.x) / 2, 0.04, (from.z + to.z) / 2]}
            rotation={[0, Math.atan2(dx, dz), 0]}
            scale={[0.14, 0.05, length]}
            onClick={pick({ kind: 'edge', from: edge.from, to: edge.to })}
          />
        );
      })}

      {/* Anchors — tappable, draggable in edit mode */}
      {anchors.map((anchor) => {
        const isMapSpawn = map?.spawnAnchorId === anchor.id;
        const isTransition = anchor.transitionId !== undefined;
        const sel = isSelected(selection, 'anchor', anchor.id);
        const color = sel
          ? COLOR.selected
          : isMapSpawn
            ? COLOR.spawn
            : isTransition
              ? COLOR.transition
              : anchor.walkable
                ? COLOR.walkable
                : COLOR.blocked;
        return (
          <group key={anchor.id} position={[anchor.x, 0, anchor.z]}>
            <mesh
              geometry={CYLINDER}
              material={sharedLambert(color)}
              position={[0, 0.12, 0]}
              scale={[0.35, 0.22, 0.35]}
              onPointerDown={(event) => {
                event.stopPropagation();
                dragging.current = anchor.id;
                onSelect({ kind: 'anchor', id: anchor.id });
              }}
            />
            {isMapSpawn ? (
              <mesh
                geometry={CYLINDER}
                material={sharedLambert(COLOR.spawn)}
                position={[0, 0.5, 0]}
                scale={[0.08, 0.5, 0.08]}
                raycast={noRaycast}
              />
            ) : null}
          </group>
        );
      })}

      {/* Transition markers over their departure anchors */}
      {transitions.map((transition) => {
        const anchor = anchorById.get(transition.fromAnchor);
        if (!anchor) return null;
        const sel = isSelected(selection, 'transition', transition.id);
        return (
          <mesh
            key={transition.id}
            geometry={CYLINDER}
            material={sharedLambert(sel ? COLOR.selected : COLOR.transition)}
            position={[anchor.x, 0.75, anchor.z]}
            scale={[0.16, 0.9, 0.16]}
            onClick={pick({ kind: 'transition', id: transition.id })}
          />
        );
      })}

      {/* NPC home placements */}
      {placements.map((placement) => {
        const anchor = anchorById.get(placement.anchorId);
        if (!anchor) return null;
        const sel = isSelected(selection, 'placement', placement.npcId);
        return (
          <mesh
            key={placement.npcId}
            geometry={SPHERE}
            material={sharedLambert(sel ? COLOR.selected : COLOR.npc)}
            position={[
              anchor.x + (placement.offsetX ?? 0),
              0.55,
              anchor.z + (placement.offsetZ ?? 0),
            ]}
            scale={[sel ? 1.4 : 1, sel ? 1.4 : 1, sel ? 1.4 : 1]}
            onClick={pick({ kind: 'placement', npcId: placement.npcId })}
          />
        );
      })}
    </group>
  );
}
