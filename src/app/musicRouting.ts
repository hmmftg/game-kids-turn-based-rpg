import type { AudioId } from '../services/audio/manifest.ts';
import type { Mode } from '../domain/game/types.ts';

const MENU_MODES: readonly Mode[] = ['title', 'profileSelect', 'avatarSelect'];
const WORLD_MODES: readonly Mode[] = ['hub', 'dialogue', 'encounter', 'paused'];

/**
 * Pure state → music routing. Battle is an overlay on the current mode, not a
 * mode itself, so it wins whenever a battle is live. Everything else maps to
 * a menu or world bed; modes with no music (boot, gates, fallbacks) return
 * null — the caller stops playback. Used by the GameProvider mode effect and
 * by the celebration overlay's dismiss path so both agree on "what should be
 * playing now".
 */
export function musicForState(mode: Mode, battleActive: boolean): AudioId | null {
  if (battleActive) return 'music-battle';
  if (MENU_MODES.includes(mode)) return 'music-menu';
  if (WORLD_MODES.includes(mode)) return 'music-hub';
  return null;
}
