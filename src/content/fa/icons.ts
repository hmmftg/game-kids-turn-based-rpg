import type { IconId } from '../../domain/game/types.ts';
import type { IconDefinition } from '../types.ts';

/**
 * Icon semantics. Every required child action is carried by shape + animation +
 * position, never by colour alone, and each icon has a Persian accessible label.
 */
export const ICONS: readonly IconDefinition[] = [
  { id: 'icon-greet', labelFa: 'سلام دادن', shape: 'hand-wave', animationCue: 'wave' },
  { id: 'icon-smile', labelFa: 'لبخند زدن', shape: 'smile', animationCue: 'smile' },
  { id: 'icon-wave-away', labelFa: 'رد شدن بدون سلام', shape: 'hand-stop', animationCue: 'shrug' },
  { id: 'icon-turn-back', labelFa: 'برگشتن', shape: 'arrow-back', animationCue: 'turn' },
  {
    id: 'icon-help-carry',
    labelFa: 'کمک برای برداشتن سبد',
    shape: 'hands-carry',
    animationCue: 'lift',
  },
  { id: 'icon-watch', labelFa: 'فقط تماشا کردن', shape: 'eye', animationCue: 'idle' },
  {
    id: 'icon-place-basket',
    labelFa: 'گذاشتن سبد سر جایش',
    shape: 'basket-down',
    animationCue: 'place',
  },
  { id: 'icon-drop-basket', labelFa: 'رها کردن سبد', shape: 'basket-tilt', animationCue: 'drop' },
  { id: 'icon-pick-up', labelFa: 'برداشتن از روی زمین', shape: 'hand-pick', animationCue: 'pick' },
  { id: 'icon-kick', labelFa: 'هل دادن با پا', shape: 'foot', animationCue: 'nudge' },
  { id: 'icon-basket-bin', labelFa: 'گذاشتن در سبد', shape: 'basket', animationCue: 'place' },
  { id: 'icon-leave-ground', labelFa: 'گذاشتن روی زمین', shape: 'ground', animationCue: 'idle' },
  { id: 'icon-wash-hands', labelFa: 'شستن دست‌ها', shape: 'water-drop', animationCue: 'wash' },
  { id: 'icon-skip', labelFa: 'ادامه دادن', shape: 'arrow-forward', animationCue: 'idle' },
  { id: 'icon-play', labelFa: 'شروع بازی', shape: 'play', animationCue: 'pulse' },
  { id: 'icon-pause', labelFa: 'توقف', shape: 'pause', animationCue: 'none' },
  { id: 'icon-sticker', labelFa: 'برچسب', shape: 'star', animationCue: 'pop' },
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
