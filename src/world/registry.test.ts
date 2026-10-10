import { describe, expect, it } from 'vitest';
import type { AnchorId, NpcId } from '../domain/game/types.ts';
import { QUEST_DEFINITIONS, questChain } from '../domain/quests/definitions.ts';
import { DIALOGUE_NODES, getDialogueNode } from '../content/fa/dialogue.ts';
import { ANCHORS, EDGES, getAnchor } from './navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from './worldSource.ts';
import { GROUND_DECORATIONS } from './decorations.ts';
import { NPC_LOOKS } from './npcLooks.ts';
import {
  NPC_DEFINITIONS,
  WORLD_AREAS,
  adjacentAreaIds,
  areaAt,
  areaForAnchor,
  insideBounds,
  npcFigureJitter,
  npcFigurePosition,
  npcsAtAnchor,
  npcsForArea,
  npcStandingAt,
  resolveNpcActivity,
  resolveNpcAnchor,
  resolveNpcStand,
  visibleAreaIds,
} from './registry.ts';
import { NPC_STAND_OFFSET } from './placement.ts';
import type { NpcDefinition } from '../domain/world/types.ts';

const dialogueIds = new Set(DIALOGUE_NODES.map((node) => node.id));
const areaIds = new Set(WORLD_AREAS.map((area) => area.id));

describe('world areas', () => {
  it('area ids are unique and bounds are sane', () => {
    expect(areaIds.size).toBe(WORLD_AREAS.length);
    for (const area of WORLD_AREAS) {
      expect(area.bounds.minX).toBeLessThan(area.bounds.maxX);
      expect(area.bounds.minZ).toBeLessThan(area.bounds.maxZ);
    }
  });

  it('every anchor belongs to a valid area and sits inside its bounds', () => {
    for (const anchor of ANCHORS) {
      expect(areaIds.has(anchor.areaId), anchor.id).toBe(true);
      const bounds = WORLD_AREAS.find((area) => area.id === anchor.areaId)!.bounds;
      expect(insideBounds(bounds, anchor.x, anchor.z), anchor.id).toBe(true);
    }
  });

  it('every decoration slot belongs to a visible area', () => {
    for (const slot of GROUND_DECORATIONS) {
      expect(areaAt(STATIC_WORLD_SOURCE, slot.x, slot.z), `(${slot.x}, ${slot.z})`).not.toBeNull();
    }
  });

  it('areas connect through shared edges (single coordinate system)', () => {
    const crossArea = EDGES.filter(
      (edge) =>
        getAnchor(STATIC_WORLD_SOURCE, edge.from).areaId !==
        getAnchor(STATIC_WORLD_SOURCE, edge.to).areaId,
    );
    expect(crossArea.length).toBeGreaterThan(0);
    for (const edge of crossArea) {
      const a = getAnchor(STATIC_WORLD_SOURCE, edge.from).areaId;
      const b = getAnchor(STATIC_WORLD_SOURCE, edge.to).areaId;
      expect(adjacentAreaIds(STATIC_WORLD_SOURCE, a)).toContain(b);
      expect(adjacentAreaIds(STATIC_WORLD_SOURCE, b)).toContain(a);
    }
  });
});

describe('NPC registry', () => {
  it('npc ids are unique and the cast is noticeably larger than the slice', () => {
    expect(new Set(NPC_DEFINITIONS.map((npc) => npc.id)).size).toBe(NPC_DEFINITIONS.length);
    expect(NPC_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('every NPC has a valid home area, anchor, look and dialogue', () => {
    for (const npc of NPC_DEFINITIONS) {
      expect(areaIds.has(npc.homeAreaId), npc.id).toBe(true);
      expect(getAnchor(STATIC_WORLD_SOURCE, npc.anchorId).areaId, npc.id).toBe(npc.homeAreaId);
      expect(NPC_LOOKS[npc.id], npc.id).toBeDefined();
      expect(npc.dialogueIds.length, npc.id).toBeGreaterThan(0);
      for (const id of npc.dialogueIds) {
        expect(dialogueIds.has(id), `${npc.id} → ${id}`).toBe(true);
      }
    }
  });

  it('NPC definitions can grow without creating work for inactive areas', () => {
    // Simulate a much larger cast: dozens of synthetic NPCs in non-adjacent
    // areas must not appear in the visible set — scaling is bounded by areas,
    // not by NPC count.
    const synthetic: NpcDefinition[] = Array.from({ length: 40 }, (_, i) => ({
      id: `npc-synth-${i}` as NpcId,
      archetype: 'child',
      anchorId: 'anchor-park',
      homeAreaId: 'area-park',
      dialogueIds: ['sara-intro'],
    }));
    const visible = visibleAreaIds(STATIC_WORLD_SOURCE, 'area-town');
    const rendered = synthetic.filter((npc) =>
      visible.includes(
        areaForAnchor(STATIC_WORLD_SOURCE, resolveNpcAnchor(STATIC_WORLD_SOURCE, npc, 0)),
      ),
    );
    expect(rendered).toHaveLength(0);
    // The real cast renders the town + adjacent subset only.
    const real = NPC_DEFINITIONS.filter((npc) =>
      visible.includes(
        areaForAnchor(STATIC_WORLD_SOURCE, resolveNpcAnchor(STATIC_WORLD_SOURCE, npc, 0)),
      ),
    );
    expect(real.length).toBeGreaterThan(0);
    expect(real.length).toBeLessThan(NPC_DEFINITIONS.length);
  });
});

describe('area activation and schedules', () => {
  it('visibleAreaIds is the active area plus one-hop neighbours', () => {
    expect(visibleAreaIds(STATIC_WORLD_SOURCE, 'area-town')).toContain('area-town');
    expect(visibleAreaIds(STATIC_WORLD_SOURCE, 'area-town')).toContain('area-home');
    expect(visibleAreaIds(STATIC_WORLD_SOURCE, 'area-town')).not.toContain('area-park');
    expect(visibleAreaIds(STATIC_WORLD_SOURCE, 'area-park')).toEqual([
      'area-park',
      'area-fountain',
    ]);
  });

  it('the scheduled fisher follows world time, not the player location', () => {
    const fisher = NPC_DEFINITIONS.find((npc) => npc.id === 'npc-fisher')!;
    // The spot index is spots[worldTime % 3]: river → bakery → river bank …,
    // identical regardless of which area the player stands in.
    expect(resolveNpcAnchor(STATIC_WORLD_SOURCE, fisher, 0)).toBe('anchor-river');
    expect(resolveNpcAnchor(STATIC_WORLD_SOURCE, fisher, 1)).toBe('anchor-bakery');
    expect(resolveNpcAnchor(STATIC_WORLD_SOURCE, fisher, 2)).toBe('anchor-river-bank');
    expect(resolveNpcAnchor(STATIC_WORLD_SOURCE, fisher, 3)).toBe('anchor-river');
    expect(resolveNpcAnchor(STATIC_WORLD_SOURCE, fisher, 42)).toBe('anchor-river');
  });

  it('idle NPCs never move — their standpoint is data, not simulation', () => {
    const neighbour = NPC_DEFINITIONS.find((npc) => npc.id === 'npc-neighbour')!;
    for (const tick of [0, 1, 7, 100]) {
      expect(resolveNpcAnchor(STATIC_WORLD_SOURCE, neighbour, tick)).toBe('anchor-home-gate');
    }
  });

  it('npcFigurePosition lands the figure where the renderer draws it', () => {
    // The one spatial truth: stand anchor + NPC_STAND_OFFSET + spot offset +
    // jitter — what Hub/ChallengeWorld render, probes report, and the
    // dialogue camera frames.
    const neighbour = NPC_DEFINITIONS.find((npc) => npc.id === 'npc-neighbour')!;
    const at = npcFigurePosition(STATIC_WORLD_SOURCE, neighbour, 0);
    expect(at).not.toBeNull();
    const anchor = getAnchor(STATIC_WORLD_SOURCE, 'anchor-home-gate');
    const jitter = npcFigureJitter(STATIC_WORLD_SOURCE, 'npc-neighbour');
    expect(at!.x).toBeCloseTo(anchor.x + NPC_STAND_OFFSET.x + jitter.x, 5);
    expect(at!.z).toBeCloseTo(anchor.z + NPC_STAND_OFFSET.z + jitter.z, 5);
    // A scheduled spot's authored offset is part of the figure position.
    const fisher = NPC_DEFINITIONS.find((npc) => npc.id === 'npc-fisher')!;
    const atRiver = npcFigurePosition(STATIC_WORLD_SOURCE, fisher, 0);
    const stand = resolveNpcStand(STATIC_WORLD_SOURCE, fisher, 0);
    const riverAnchor = getAnchor(STATIC_WORLD_SOURCE, stand.anchorId);
    const fisherJitter = npcFigureJitter(STATIC_WORLD_SOURCE, 'npc-fisher');
    expect(atRiver!.x).toBeCloseTo(
      riverAnchor.x + NPC_STAND_OFFSET.x + stand.offsetX + fisherJitter.x,
      5,
    );
    expect(atRiver!.z).toBeCloseTo(
      riverAnchor.z + NPC_STAND_OFFSET.z + stand.offsetZ + fisherJitter.z,
      5,
    );
  });

  it('routines resolve who stands at an anchor — resident first, then visitor', () => {
    const fisher = NPC_DEFINITIONS.find((npc) => npc.id === 'npc-fisher')!;
    // Tick 0: the fisher works the river — he answers at his home anchor.
    expect(npcStandingAt(STATIC_WORLD_SOURCE, 'anchor-river', 0)?.id).toBe('npc-fisher');
    // Tick 1: he queues at the bakery — the resident baker still answers
    // there, and nobody is left at the river or the bank.
    expect(npcStandingAt(STATIC_WORLD_SOURCE, 'anchor-bakery', 1)?.id).toBe('npc-baker');
    expect(npcsAtAnchor(STATIC_WORLD_SOURCE, 'anchor-bakery', 1).map((npc) => npc.id)).toEqual([
      'npc-baker',
      'npc-fisher',
    ]);
    expect(npcStandingAt(STATIC_WORLD_SOURCE, 'anchor-river', 1)).toBeNull();
    // Tick 2: resting on the bank — the river's own anchor is empty.
    expect(npcStandingAt(STATIC_WORLD_SOURCE, 'anchor-river-bank', 2)?.id).toBe('npc-fisher');
    expect(npcStandingAt(STATIC_WORLD_SOURCE, 'anchor-river', 2)).toBeNull();
    expect(resolveNpcActivity(fisher, 2)).toBe('at-home');
  });

  it('every routine spot carries a reachable contextual greeting', () => {
    for (const npc of NPC_DEFINITIONS) {
      for (const spot of npc.schedule?.spots ?? []) {
        if (spot.dialogueId === undefined) continue;
        const node = DIALOGUE_NODES.find((entry) => entry.id === spot.dialogueId);
        expect(node, `${npc.id} → ${spot.dialogueId}`).toBeDefined();
        // A greeting belongs to the NPC who says it.
        expect(node?.npcId, `${npc.id} → ${spot.dialogueId}`).toBe(npc.id);
      }
    }
  });

  it('quest hotspots only exist inside the visible area set', () => {
    // Interaction cost must scale with visible content: a quest whose anchor
    // sits outside active + adjacent areas mounts no Hotspot at all. From the
    // park, no quest anchor is visible — zero hotspots mounted.
    const farVisible = visibleAreaIds(STATIC_WORLD_SOURCE, 'area-park');
    const mountedFar = QUEST_DEFINITIONS.filter((quest) =>
      farVisible.includes(getAnchor(STATIC_WORLD_SOURCE, quest.anchorId as AnchorId).areaId),
    );
    // Only the park quest itself is mounted there.
    expect(mountedFar.map((quest) => quest.id)).toEqual(['quest-park-kite']);
    // Around the town only quests anchored in town + adjacent areas mount —
    // the river and school quests stay data-only until the child walks over.
    const townVisible = visibleAreaIds(STATIC_WORLD_SOURCE, 'area-town');
    const mountedTown = QUEST_DEFINITIONS.filter((quest) =>
      townVisible.includes(getAnchor(STATIC_WORLD_SOURCE, quest.anchorId as AnchorId).areaId),
    );
    expect(mountedTown.map((quest) => quest.id)).toEqual([
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
      'quest-bread-errand',
    ]);
  });
});

describe('dialogue graph', () => {
  it('node ids are unique and every speaker resolves', () => {
    expect(dialogueIds.size).toBe(DIALOGUE_NODES.length);
    const npcIds = new Set(NPC_DEFINITIONS.map((npc) => npc.id));
    for (const node of DIALOGUE_NODES) {
      expect(npcIds.has(node.npcId), node.id).toBe(true);
      for (const line of node.lines ?? []) {
        expect(npcIds.has(line.speakerId), `${node.id} line`).toBe(true);
      }
    }
  });

  it('every branch target resolves and choices have stable unique ids', () => {
    for (const node of DIALOGUE_NODES) {
      const choiceIds = new Set((node.choices ?? []).map((choice) => choice.id));
      expect(choiceIds.size).toBe((node.choices ?? []).length);
      for (const choice of node.choices ?? []) {
        expect(getDialogueNode(choice.nextNodeId), choice.nextNodeId).not.toBeNull();
      }
      if (node.nextNodeId !== undefined) {
        expect(getDialogueNode(node.nextNodeId), node.nextNodeId).not.toBeNull();
      }
    }
  });

  it('has no orphan nodes: everything is reachable from an entry point', () => {
    const reachable = new Set<string>([
      ...NPC_DEFINITIONS.flatMap((npc) => [
        ...npc.dialogueIds,
        ...(npc.schedule?.spots.flatMap((spot) => (spot.dialogueId ? [spot.dialogueId] : [])) ??
          []),
      ]),
      ...QUEST_DEFINITIONS.flatMap((quest) => [...quest.dialogueIds]),
    ]);
    let frontier = [...reachable];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        const node = getDialogueNode(id);
        if (!node) continue;
        for (const target of [
          ...(node.choices ?? []).map((choice) => choice.nextNodeId),
          ...(node.nextNodeId !== undefined ? [node.nextNodeId] : []),
        ]) {
          if (!reachable.has(target)) {
            reachable.add(target);
            next.push(target);
          }
        }
      }
      frontier = next;
    }
    for (const node of DIALOGUE_NODES) {
      expect(reachable.has(node.id), node.id).toBe(true);
    }
  });

  it('a branching dialogue exists in the representative content', () => {
    const teacher = getDialogueNode('teacher-intro')!;
    expect(teacher.choices!.length).toBeGreaterThanOrEqual(2);
    expect(getDialogueNode('teacher-story')!.nextNodeId).toBeUndefined();
  });
});

describe('quest references and chains', () => {
  it('quests resolve their area, npc and dialogue references', () => {
    const npcIds = new Set(NPC_DEFINITIONS.map((npc) => npc.id));
    for (const quest of QUEST_DEFINITIONS) {
      expect(areaIds.has(quest.areaId), quest.id).toBe(true);
      for (const npcId of quest.npcIds) {
        expect(npcIds.has(npcId), `${quest.id} → ${npcId}`).toBe(true);
      }
      for (const id of quest.dialogueIds) {
        expect(dialogueIds.has(id), `${quest.id} → ${id}`).toBe(true);
      }
      for (const step of quest.steps) {
        expect(npcIds.has(step.npcId), `${quest.id}.${step.id}`).toBe(true);
      }
    }
  });

  it('the representative quest chain spans the full story so far', () => {
    expect(questChain('quest-greeting')).toEqual([
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
      'quest-park-kite',
      'quest-river-shell',
      'quest-bread-errand',
      'quest-school-answer',
      'quest-cave-crystal',
    ]);
  });

  it('every area with a major identity has a playable quest anchored in it', () => {
    // The expanded areas are explorable through content, not decoration.
    const byId = new Map(QUEST_DEFINITIONS.map((quest) => [quest.id, quest]));
    expect(byId.get('quest-park-kite')?.areaId).toBe('area-park');
    expect(byId.get('quest-river-shell')?.areaId).toBe('area-river');
    expect(byId.get('quest-bread-errand')?.areaId).toBe('area-market');
    expect(byId.get('quest-school-answer')?.areaId).toBe('area-school');
    for (const quest of QUEST_DEFINITIONS) {
      const anchor = getAnchor(STATIC_WORLD_SOURCE, quest.anchorId as AnchorId);
      expect(anchor.areaId, quest.id).toBe(quest.areaId);
    }
  });
});

describe('render budget shape', () => {
  it('npcsForArea stays a small visible subset as the world grows', () => {
    expect(npcsForArea(STATIC_WORLD_SOURCE, 'area-park').length).toBe(2);
    // One-hop visibility bounds the active NPC set regardless of total count.
    for (const area of areaIds) {
      const visible = visibleAreaIds(STATIC_WORLD_SOURCE, area);
      for (const tick of [0, 1, 2, 3]) {
        const active = NPC_DEFINITIONS.filter((npc) =>
          visible.includes(
            areaForAnchor(STATIC_WORLD_SOURCE, resolveNpcAnchor(STATIC_WORLD_SOURCE, npc, tick)),
          ),
        );
        expect(active.length).toBeLessThanOrEqual(8);
      }
    }
  });
});
