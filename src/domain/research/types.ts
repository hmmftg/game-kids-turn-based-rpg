/**
 * Research Session Mode (PR R+) — closed event vocabulary.
 *
 * Structured gameplay observations for the PR R usability protocol
 * (docs/USABILITY-PROTOCOL.md). NOT analytics: no identity, no coordinates
 * beyond the semantic anchor a tap resolved to, no audio/video, nothing
 * that outlives an explicit parent export or configured upload.
 */

export type AgeBand = '3-4' | '5-7';

/**
 * Observer bookmarks (R.1): the watching parent marks a moment that matters
 * — worth more than raw taps. These are entered by hand during a session,
 * never auto-detected.
 */
export type ObserverBookmark =
  'stuck' | 'repeated' | 'discovered' | 'completed_solo' | 'asked_help';

export type ResearchEventType =
  | 'session_started'
  | 'session_ended'
  | 'observer_bookmark'
  | 'started_game'
  | 'selected_avatar'
  | 'tapped_wrong_place'
  | 'found_npc'
  | 'started_quest'
  | 'completed_action'
  | 'waited'
  | 'repeated_action'
  | 'abandoned';

export interface ResearchContext {
  readonly questId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly npcId?: string | undefined;
  readonly battleId?: string | undefined;
  readonly phase?: string | undefined;
  /** The anchor a tap resolved to, or 'none' for a dead tap — never raw coords. */
  readonly target?: string | undefined;
  readonly ageBand?: AgeBand | undefined;
  readonly mode?: 'normal' | 'nocopy' | undefined;
  readonly reducedMotion?: boolean | undefined;
  /** session_started environment — coarse classes only, never identity. */
  readonly buildVersion?: string | undefined;
  readonly deviceClass?: string | undefined;
  readonly locale?: string | undefined;
  readonly muted?: boolean | undefined;
  /** session_ended */
  readonly durationMs?: number | undefined;
  /** observer_bookmark */
  readonly bookmark?: ObserverBookmark | undefined;
}

export interface ResearchEvent {
  readonly sessionId: string;
  readonly timestamp: number;
  readonly event: ResearchEventType;
  readonly context: ResearchContext;
}

export interface ResearchSession {
  readonly sessionId: string;
  readonly startedAt: number;
  readonly ageBand: AgeBand;
  readonly mode: 'normal' | 'nocopy';
  readonly reducedMotion: boolean;
}
