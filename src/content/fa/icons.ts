import type { IconId } from '../../domain/game/types.ts';
import type { IconDefinition } from '../types.ts';

/**
 * Icon semantics. Every required child action is carried by shape + animation +
 * position, never by colour alone, and each icon has a Persian accessible label.
 * Colours are warm and distinct so a 4-year-old can tell actions apart at a
 * glance; they are decoration, not meaning.
 */
export const ICONS: readonly IconDefinition[] = [
  {
    id: 'icon-greet',
    labelFa: 'سلام دادن',
    shape: 'hand-wave',
    animationCue: 'wave',
    color: '#e08a3c',
  },
  {
    id: 'icon-smile',
    labelFa: 'لبخند زدن',
    shape: 'smile',
    animationCue: 'smile',
    color: '#e8a400',
  },
  {
    id: 'icon-wave-away',
    labelFa: 'رد شدن بدون سلام',
    shape: 'hand-stop',
    animationCue: 'shrug',
    color: '#c46a6a',
  },
  {
    id: 'icon-turn-back',
    labelFa: 'برگشتن',
    shape: 'arrow-back',
    animationCue: 'turn',
    color: '#7c8aa0',
  },
  {
    id: 'icon-help-carry',
    labelFa: 'کمک برای برداشتن سبد',
    shape: 'hands-carry',
    animationCue: 'lift',
    color: '#3f8f5f',
  },
  {
    id: 'icon-watch',
    labelFa: 'فقط تماشا کردن',
    shape: 'eye',
    animationCue: 'idle',
    color: '#5a7bd5',
  },
  {
    id: 'icon-place-basket',
    labelFa: 'گذاشتن سبد سر جایش',
    shape: 'basket-down',
    animationCue: 'place',
    color: '#9c6b3d',
  },
  {
    id: 'icon-drop-basket',
    labelFa: 'رها کردن سبد',
    shape: 'basket-tilt',
    animationCue: 'drop',
    color: '#c46a4a',
  },
  {
    id: 'icon-pick-up',
    labelFa: 'برداشتن از روی زمین',
    shape: 'hand-pick',
    animationCue: 'pick',
    color: '#4f9c6f',
  },
  {
    id: 'icon-kick',
    labelFa: 'هل دادن با پا',
    shape: 'foot',
    animationCue: 'nudge',
    color: '#c2516b',
  },
  {
    id: 'icon-basket-bin',
    labelFa: 'گذاشتن در سبد',
    shape: 'basket',
    animationCue: 'place',
    color: '#9c6b3d',
  },
  {
    id: 'icon-leave-ground',
    labelFa: 'گذاشتن روی زمین',
    shape: 'ground',
    animationCue: 'idle',
    color: '#8b95a3',
  },
  {
    id: 'icon-wash-hands',
    labelFa: 'شستن دست‌ها',
    shape: 'water-drop',
    animationCue: 'wash',
    color: '#3f8fd5',
  },
  {
    id: 'icon-skip',
    labelFa: 'ادامه دادن',
    shape: 'arrow-forward',
    animationCue: 'idle',
    color: '#7c8aa0',
  },
  { id: 'icon-play', labelFa: 'شروع بازی', shape: 'play', animationCue: 'pulse', color: '#2f9e63' },
  { id: 'icon-pause', labelFa: 'توقف', shape: 'pause', animationCue: 'none', color: '#5a6b7b' },
  { id: 'icon-sticker', labelFa: 'برچسب', shape: 'star', animationCue: 'pop', color: '#e0a83c' },
];

const BY_ID = new Map<IconId, IconDefinition>(ICONS.map((icon) => [icon.id, icon]));

export function getIcon(id: IconId): IconDefinition {
  const icon = BY_ID.get(id);
  if (!icon) throw new Error(`Unknown icon: ${id}`);
  return icon;
}

export function hasIcon(id: IconId): boolean {
  return BY_ID.has(id);
}
