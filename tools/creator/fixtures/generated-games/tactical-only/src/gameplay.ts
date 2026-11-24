import { compileGameplay, type GameplayDefinition } from 'waypoint-rpg-gameplay';

export const gameplayDefinition = {
  schemaVersion: 1,
  id: 'generated-tactical-game',
  contentVersion: 'copy-1',
  compatibilityVersion: 'tactical-shape-1',
  movementAttributeId: 'movement',
  healthResourceId: 'health',
  inventoryCapacity: 4,
  attributes: [
    { id: 'movement', minimum: 1, maximum: 4, defaultValue: 1 },
    { id: 'power', minimum: 0, maximum: 4, defaultValue: 1 },
  ],
  resources: [{ id: 'health', maximum: 3, defaultValue: 3 }],
  progression: { maxLevel: 1, experienceThresholds: [] },
  characters: [
    {
      id: 'traveler',
      baseAttributes: { movement: 1, power: 1 },
      startingAbilityIds: ['traveler-strike'],
    },
    {
      id: 'watcher',
      baseAttributes: { movement: 1, power: 1 },
      startingAbilityIds: ['watcher-strike'],
    },
  ],
  items: [
    {
      id: 'ember-charm',
      stackLimit: 1,
      unique: true,
      equipment: {
        slotId: 'charm',
        modifiers: [{ attributeId: 'power', amount: 1 }],
        grantedAbilityIds: ['traveler-strike'],
      },
    },
    { id: 'victory-shell', stackLimit: 3 },
  ],
  equipmentSlots: [{ id: 'charm' }],
  abilities: [
    {
      id: 'traveler-strike',
      resourceCosts: {},
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
      effects: [{ op: 'damage', amount: 3 }],
    },
    {
      id: 'watcher-strike',
      resourceCosts: {},
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 1 },
      effects: [{ op: 'damage', amount: 3 }],
    },
  ],
  statusEffects: [],
  boards: [{ id: 'practice-board', width: 3, height: 2, blockedCells: [] }],
  encounters: [
    {
      id: 'practice-duel',
      boardId: 'practice-board',
      maxTurns: 4,
      allowWithdrawal: true,
      participants: [
        {
          id: 'traveler-turn',
          characterId: 'traveler',
          team: 'player',
          position: { x: 0, y: 0 },
          initiative: 10,
        },
        {
          id: 'watcher-turn',
          characterId: 'watcher',
          team: 'enemy',
          position: { x: 1, y: 0 },
          initiative: 1,
        },
      ],
      victoryRewards: {
        experience: [{ characterId: 'traveler', amount: 2 }],
        items: [{ itemId: 'victory-shell', quantity: 1 }],
      },
      outcomeMappings: [
        { outcome: 'victory', consequenceId: 'duel-won' },
        { outcome: 'defeat', consequenceId: 'duel-lost' },
        { outcome: 'turn-limit', consequenceId: 'duel-paused' },
        { outcome: 'withdrawn', consequenceId: 'duel-left' },
      ],
    },
  ],
} as const satisfies GameplayDefinition;

export const compiledGameplay = compileGameplay(gameplayDefinition);
