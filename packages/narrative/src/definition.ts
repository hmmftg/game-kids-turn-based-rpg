/** JSON-compatible values accepted in authored facts and save snapshots. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type PersistedQuestStatus = 'active' | 'completed' | 'failed' | 'cancelled';
export type QuestStatus = 'locked' | 'available' | PersistedQuestStatus;
export type NarrativeFactType = 'boolean' | 'integer' | 'string';
export type NarrativeFactValue = boolean | number | string;

export interface NarrativeFactDefinition {
  readonly key: string;
  readonly type: NarrativeFactType;
  readonly default?: NarrativeFactValue;
}

export type NarrativeCondition =
  | { readonly op: 'flag'; readonly key: string; readonly equals: boolean }
  | { readonly op: 'eq'; readonly key: string; readonly value: JsonPrimitive }
  | { readonly op: 'neq'; readonly key: string; readonly value: JsonPrimitive }
  | {
      readonly op: 'int-gte' | 'int-gt' | 'int-lte' | 'int-lt';
      readonly key: string;
      readonly value: number;
    }
  | {
      readonly op: 'quest-status';
      readonly questId: string;
      readonly status: PersistedQuestStatus;
    }
  /** True once a repeatable quest has completed at least one attempt. */
  | { readonly op: 'quest-completed'; readonly questId: string }
  | { readonly op: 'all' | 'any'; readonly conditions: readonly NarrativeCondition[] }
  | { readonly op: 'not'; readonly condition: NarrativeCondition };

export type NarrativeEffect =
  | { readonly op: 'set-flag'; readonly key: string; readonly value: boolean }
  | { readonly op: 'clear-flag'; readonly key: string }
  | { readonly op: 'clear-fact'; readonly key: string }
  | { readonly op: 'set-fact'; readonly key: string; readonly value: JsonValue }
  | { readonly op: 'increment-fact'; readonly key: string; readonly amount: number }
  | { readonly op: 'start-quest'; readonly questId: string }
  | { readonly op: 'complete-quest'; readonly questId: string }
  | { readonly op: 'fail-quest'; readonly questId: string }
  | { readonly op: 'cancel-quest'; readonly questId: string };

export type LocalizedText = Readonly<Record<string, string>>;

export interface DialogueChoiceDefinition {
  readonly id: string;
  readonly label: LocalizedText;
  readonly targetNodeId: string;
  readonly when?: NarrativeCondition;
  readonly effects?: readonly NarrativeEffect[];
  /** If true, the choice may be selected again at a later valid revision. */
  readonly repeatable?: boolean;
}

export interface DialogueNodeDefinition {
  readonly id: string;
  readonly speakerId: string;
  readonly text: LocalizedText;
  readonly when?: NarrativeCondition;
  readonly nextNodeId?: string;
  readonly choices?: readonly DialogueChoiceDefinition[];
  readonly terminal?: boolean;
  /** A conversation-only endpoint; closing it clears its cursor without ending the playthrough. */
  readonly closesDialogue?: boolean;
  /** Required for a terminal node; immutable within its playthrough. */
  readonly endingId?: string;
  readonly cue?: string;
}

export interface DialogueDefinition {
  readonly id: string;
  readonly entryNodeId: string;
  readonly when?: NarrativeCondition;
  readonly exitPolicy: 'allowed' | 'forbidden';
  readonly nodes: readonly DialogueNodeDefinition[];
}

export interface QuestDefinition {
  readonly id: string;
  readonly prerequisites?: NarrativeCondition;
  /** Only failed or cancelled quests may restart, and only when opted in. */
  readonly restartable?: boolean;
  /** Completed quests may begin a new attempt only when explicitly opted in. */
  readonly repeatable?: boolean;
  /** Stable step ids recorded as complete whenever this quest completes. */
  readonly stepIds?: readonly string[];
}

export interface NarrativeQuestHistory {
  /** Number of accepted completions in this playthrough. */
  readonly completionCount: number;
  /** Unique stable step ids completed across all attempts. */
  readonly completedSteps: readonly string[];
}

/** Trusted application seed for restoring generic progress without replaying effects. */
export interface NarrativeStateSeed {
  readonly facts?: Readonly<Record<string, JsonValue>>;
  readonly quests?: Readonly<Record<string, PersistedQuestStatus>>;
  readonly questHistory?: Readonly<Record<string, NarrativeQuestHistory>>;
}

export interface NarrativeTriggerDefinition {
  readonly id: string;
  readonly when?: NarrativeCondition;
  readonly effects: readonly NarrativeEffect[];
  /** Defaults to one application per playthrough; repeatable triggers need a later revision. */
  readonly repeatable?: boolean;
}

export interface NarrativeDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  /** Copy/presentation revision; it does not invalidate compatible progress. */
  readonly contentVersion: string;
  /** Explicit compatibility key for structural state/content changes. */
  readonly compatibilityVersion: string;
  /** Fallback locale after exact and base-language matches; omitted keeps legacy fallback. */
  readonly defaultLocale?: string;
  /** Omit to keep legacy untyped JSON fact behavior. */
  readonly facts?: readonly NarrativeFactDefinition[];
  readonly entryDialogueId: string;
  readonly dialogues: readonly DialogueDefinition[];
  readonly quests: readonly QuestDefinition[];
  readonly triggers?: readonly NarrativeTriggerDefinition[];
}

export interface NarrativeDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface NarrativeValidationReport {
  readonly diagnostics: readonly NarrativeDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly ok: boolean;
}

/** Opaque compiled capability; mutable indexes are kept in a module WeakMap. */
export interface CompiledNarrative {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly compatibilityVersion: string;
  readonly definition: NarrativeDefinition;
}

export interface ActiveDialogue {
  readonly dialogueId: string;
  readonly nodeId: string;
}

/** Durable state for one playthrough; UI feedback and correlation tokens are excluded. */
export interface NarrativeState {
  readonly schemaVersion: 1;
  readonly storyId: string;
  readonly compatibilityVersion: string;
  readonly playthroughId: string;
  readonly revision: number;
  readonly facts: Readonly<Record<string, JsonValue>>;
  readonly quests: Readonly<Record<string, PersistedQuestStatus>>;
  readonly questHistory: Readonly<Record<string, NarrativeQuestHistory>>;
  readonly appliedChoiceIds: readonly string[];
  readonly appliedTriggerIds: readonly string[];
  readonly activeDialogue: ActiveDialogue | null;
  /** Last permitted dialogue cursor, restored when its dialogue is reopened. */
  readonly suspendedDialogue: ActiveDialogue | null;
  readonly endingId: string | null;
}

export interface NarrativeCommandBase {
  readonly playthroughId: string;
  readonly expectedRevision: number;
}

export type NarrativeCommand = NarrativeCommandBase &
  (
    | {
        readonly type: 'open-dialogue';
        readonly dialogueId: string;
        /** Optional app-validated node within the dialogue's authored graph. */
        readonly startNodeId?: string;
      }
    | { readonly type: 'advance' }
    | { readonly type: 'choose'; readonly choiceId: string }
    | { readonly type: 'exit-dialogue' }
    | { readonly type: 'close-dialogue' }
    | { readonly type: 'finish' }
    | { readonly type: 'trigger'; readonly triggerId: string }
  );

export type NarrativeRejectionCode =
  | 'invalid-command'
  | 'wrong-playthrough'
  | 'stale-revision'
  | 'story-mismatch'
  | 'compatibility-mismatch'
  | 'ending-final'
  | 'dialogue-active'
  | 'dialogue-suspended'
  | 'no-active-dialogue'
  | 'dialogue-unavailable'
  | 'node-unavailable'
  | 'not-linear'
  | 'choice-unavailable'
  | 'choice-already-applied'
  | 'exit-forbidden'
  | 'dialogue-not-closeable'
  | 'not-terminal'
  | 'trigger-unavailable'
  | 'quest-transition'
  | 'invalid-effect'
  | 'revision-overflow';

export type NarrativeTransitionResult =
  | {
      readonly accepted: true;
      readonly state: NarrativeState;
      readonly change: 'dialogue' | 'choice' | 'trigger' | 'ending';
    }
  | {
      readonly accepted: false;
      readonly state: NarrativeState;
      readonly reason: {
        readonly code: NarrativeRejectionCode;
        readonly message: string;
        readonly effectIndex?: number;
      };
    };

export interface DialogueChoiceView {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
}

export interface DialogueView {
  readonly dialogueId: string;
  readonly nodeId: string;
  readonly speakerId: string;
  readonly text: string;
  readonly terminal: boolean;
  readonly closeAllowed: boolean;
  readonly exitAllowed: boolean;
  readonly choices: readonly DialogueChoiceView[];
}

export type NarrativeDecodeResult =
  | { readonly ok: true; readonly state: NarrativeState }
  | {
      readonly ok: false;
      readonly reason:
        'invalid-payload' | 'unsupported-schema' | 'story-mismatch' | 'incompatible-definition';
      readonly message: string;
    };
