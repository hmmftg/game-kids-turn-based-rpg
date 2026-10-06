/**
 * Research Session Mode (PR R+) — closed event vocabulary.
 *
 * Structured gameplay observations for the PR R usability protocol
 * (docs/USABILITY-PROTOCOL.md). NOT analytics: no identity, no coordinates
 * beyond the semantic anchor a tap resolved to, no audio/video, nothing
 * that outlives an explicit parent export or configured upload.
 */

export type AgeBand = '3-4' | '5-7';

export type ResearchEventType =
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
