import { describe, expect, it } from 'vitest';
import type { NpcId } from '../domain/game/types.ts';
import { QUEST_DEFINITIONS, questChain } from '../domain/quests/definitions.ts';
import { DIALOGUE_NODES, getDialogueNode } from '../content/fa/dialogue.ts';
import { ANCHORS, EDGES, getAnchor } from './navigation/graph.ts';
import { GROUND_DECORATIONS } from './decorations.ts';
import { NPC_LOOKS } from './npcLooks.ts';
import {
  NPC_DEFINITIONS,
  WORLD_AREAS,
  adjacentAreaIds,
  areaAt,
  areaForAnchor,
  insideBounds,
  npcsForArea,
  resolveNpcAnchor,
  visibleAreaIds,
} from './registry.ts';
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
      expect(areaAt(slot.x, slot.z), `(${slot.x}, ${slot.z})`).not.toBeNull();
    }
  });

  it('areas connect through shared edges (single coordinate system)', () => {
    const crossArea = EDGES.filter(
      (edge) => getAnchor(edge.from).areaId !== getAnchor(edge.to).areaId,
    );
    expect(crossArea.length).toBeGreaterThan(0);
    for (const edge of crossArea) {
      const a = getAnchor(edge.from).areaId;
      const b = getAnchor(edge.to).areaId;
      expect(adjacentAreaIds(a)).toContain(b);
      expect(adjacentAreaIds(b)).toContain(a);
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
      expect(getAnchor(npc.anchorId).areaId, npc.id).toBe(npc.homeAreaId);
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
    const visible = visibleAreaIds('area-town');
    const rendered = synthetic.filter((npc) =>
      visible.includes(areaForAnchor(resolveNpcAnchor(npc, 'area-town'))),
    );
    expect(rendered).toHaveLength(0);
    // The real cast renders the town + adjacent subset only.
    const real = NPC_DEFINITIONS.filter((npc) =>
      visible.includes(areaForAnchor(resolveNpcAnchor(npc, 'area-town'))),
    );
    expect(real.length).toBeGreaterThan(0);
    expect(real.length).toBeLessThan(NPC_DEFINITIONS.length);
  });
});

describe('area activation and schedules', () => {
  it('visibleAreaIds is the active area plus one-hop neighbours', () => {
    expect(visibleAreaIds('area-town')).toContain('area-town');
    expect(visibleAreaIds('area-town')).toContain('area-home');
    expect(visibleAreaIds('area-town')).not.toContain('area-park');
    expect(visibleAreaIds('area-park')).toEqual(['area-park', 'area-fountain']);
  });

  it('the scheduled fisher moves between two locations deterministically', () => {
    const fisher = NPC_DEFINITIONS.find((npc) => npc.id === 'npc-fisher')!;
    // In the market the fisher queues at the bakery; elsewhere he is home.
    expect(resolveNpcAnchor(fisher, 'area-market')).toBe('anchor-bakery');
    expect(resolveNpcAnchor(fisher, 'area-river')).toBe('anchor-river');
    expect(resolveNpcAnchor(fisher, 'area-town')).toBe('anchor-bakery');
    expect(resolveNpcAnchor(fisher, 'area-park')).toBe('anchor-river');
  });

  it('idle NPCs never move — their standpoint is data, not simulation', () => {
    const teacher = NPC_DEFINITIONS.find((npc) => npc.id === 'npc-teacher')!;
    for (const area of areaIds) {
      expect(resolveNpcAnchor(teacher, area)).toBe('anchor-school');
    }
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
      ...NPC_DEFINITIONS.flatMap((npc) => [...npc.dialogueIds]),
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
    expect(getDialogueNode('teacher-story')!.nextNodeId).toBe('teacher-story-end');
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
    ]);
  });
});

describe('render budget shape', () => {
  it('npcsForArea stays a small visible subset as the world grows', () => {
    expect(npcsForArea('area-park').length).toBe(2);
    // One-hop visibility bounds the active NPC set regardless of total count.
    for (const area of areaIds) {
      const visible = visibleAreaIds(area);
      const active = NPC_DEFINITIONS.filter((npc) =>
        visible.includes(areaForAnchor(resolveNpcAnchor(npc, area))),
      );
      expect(active.length).toBeLessThanOrEqual(8);
    }
  });
});
