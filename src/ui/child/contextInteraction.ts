import type { IconId, QuestId } from '../../domain/game/types.ts';
import { getQuestStep } from '../../domain/quests/definitions.ts';
import { HELD_ITEM, type HeldItem, type SceneElement } from './SceneChoice.tsx';

/**
 * ContextInteraction — the pure interaction model behind the scene layer.
 *
 * Answers "what is the situation" from quest state: which physical things are
 * present, which of them is the *one obvious target*, what (if anything) the
 * child is holding. It never contains copy and never dispatches — the visual
 * layer turns each object into a tap that fires the existing CHOOSE(iconId).
 */

export type ScenePhase =
  /** A thing is present and tappable (leaf on ground, neighbour to greet). */
  | 'target-available'
  /** The child holds something; the decision is a destination, not an action. */
  | 'choose-destination'
  /** Reserved for true target selection (e.g. throw). */
  | 'choose-target';

export type SceneRole =
  /** The thing the action acts on (leaf, basket to carry). */
  | 'object'
  /** A place the held thing can go (shelf, bin, bare floor). */
  | 'destination'
  /** A person the action involves (neighbour). */
  | 'actor'
  /** A way out / non-kindness alternative (path, turned-away figure). */
  | 'escape';

export interface SceneObject {
  /** Implementation detail — the existing CHOOSE command id. */
  readonly iconId: IconId;
  readonly element: SceneElement;
  readonly role: SceneRole;
  /** Product rule: exactly one obvious target. `iconId === correctIconId`. */
  readonly isCorrect: boolean;
  readonly prominence: 'primary' | 'secondary';
}

export interface ContextInteraction {
  readonly phase: ScenePhase;
  /** What the child visibly holds on place-type steps. */
  readonly held: HeldItem | null;
  readonly objects: readonly SceneObject[];
}

/** iconId → the physical thing/place it acts on (same contract as #18):
 *  null when the choice has no distinct target — it then cannot be shown as
 *  a tappable object at all. */
export function sceneElementFor(iconId: IconId): SceneElement | null {
  switch (iconId) {
    case 'icon-greet':
      return 'person';
    case 'icon-smile':
      return 'face';
    case 'icon-wave-away':
      return 'person-away';
    case 'icon-turn-back':
      return 'path-back';
    case 'icon-help-carry':
      return 'basket';
    case 'icon-watch':
      return 'person';
    case 'icon-place-basket':
      return 'shelf';
    case 'icon-drop-basket':
    case 'icon-leave-ground':
      return 'floor';
    case 'icon-pick-up':
      return 'leaf';
    case 'icon-basket-bin':
      return 'bin';
    case 'icon-wash-hands':
      return 'water';
    case 'icon-skip':
      return 'path-forward';
    case 'icon-pick-kite':
      return 'kite';
    case 'icon-give-kite':
      return 'person';
    case 'icon-spot-fish':
      return 'fish';
    case 'icon-collect-shell':
      return 'shell';
    case 'icon-give-shell':
      return 'basket';
    case 'icon-take-bread':
      return 'bread';
    case 'icon-place-bread':
      return 'shelf';
    case 'icon-tap-book':
      return 'book';
    case 'icon-tap-ball':
      return 'ball';
    default:
      return null;
  }
}

function sceneRoleFor(iconId: IconId): SceneRole {
  switch (iconId) {
    case 'icon-place-basket':
    case 'icon-drop-basket':
    case 'icon-basket-bin':
    case 'icon-leave-ground':
    case 'icon-give-shell':
    case 'icon-place-bread':
      return 'destination';
    case 'icon-greet':
    case 'icon-smile':
    case 'icon-watch':
    case 'icon-give-kite':
      return 'actor';
    case 'icon-wave-away':
    case 'icon-turn-back':
    case 'icon-skip':
      return 'escape';
    default:
      return 'object';
  }
}

/** Situation for one encounter step: objects + held state + the single
 *  prominent target. Wrong objects stay tappable (gentle retry), just weaker. */
export function contextForStep(questId: QuestId, stepIndex: number): ContextInteraction {
  const step = getQuestStep(questId, stepIndex);
  if (!step) return { phase: 'target-available', held: null, objects: [] };
  const held = HELD_ITEM[step.correctIconId] ?? null;
  const objects: SceneObject[] = step.choiceIconIds.flatMap((iconId) => {
    const element = sceneElementFor(iconId);
    if (element === null) return [];
    const isCorrect = iconId === step.correctIconId;
    return [
      {
        iconId,
        element,
        role: sceneRoleFor(iconId),
        isCorrect,
        prominence: isCorrect ? 'primary' : 'secondary',
      },
    ];
  });
  return {
    phase: held !== null ? 'choose-destination' : 'target-available',
    held,
    objects,
  };
}
