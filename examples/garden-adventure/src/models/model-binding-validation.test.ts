import { describe, expect, it } from 'vitest';
import { validateGardenModelBindings } from './model-binding-validation.js';

const context = {
  assetIds: ['phase5-animated-guardian', 'phase5-textured-static'],
  mapIds: ['village', 'garden'],
  targets: [
    { id: 'guardian', kind: 'guardian', mapId: 'garden' },
    { id: 'ancient-lantern', kind: 'lantern', mapId: 'garden' },
  ],
};

const validBindings = {
  'garden-hero': {
    assetId: 'phase5-animated-guardian',
    mapIds: ['village', 'garden'],
    placement: { kind: 'player' },
  },
  'garden-guardian': {
    assetId: 'phase5-animated-guardian',
    mapIds: ['garden'],
    placement: { kind: 'target', targetKind: 'guardian' },
  },
  'garden-lantern-base': {
    assetId: 'phase5-textured-static',
    mapIds: ['garden'],
    placement: { kind: 'target', targetKind: 'lantern' },
  },
};

describe('validateGardenModelBindings', () => {
  it('derives model instance counts from actual Garden map placements', () => {
    expect(validateGardenModelBindings(validBindings, context)).toMatchObject({
      errors: [],
      playerBindingId: 'garden-hero',
      targetBindingIds: {
        guardian: 'garden-guardian',
        lantern: 'garden-lantern-base',
      },
      modelInstancesByMap: {
        village: { 'phase5-animated-guardian': 1 },
        garden: {
          'phase5-animated-guardian': 2,
          'phase5-textured-static': 1,
        },
      },
    });
  });

  it('requires exactly one player binding', () => {
    const missing = { ...validBindings };
    delete (missing as Record<string, unknown>)['garden-hero'];
    expect(validateGardenModelBindings(missing, context).errors).toContain(
      'Garden model policy must declare exactly one player binding.',
    );

    const duplicate = {
      ...validBindings,
      'garden-hero-copy': validBindings['garden-hero'],
    };
    expect(validateGardenModelBindings(duplicate, context).errors).toContain(
      'Garden model policy must declare exactly one player binding.',
    );
  });

  it('rejects duplicate bindings for one target kind even when they use the same asset', () => {
    const duplicate = {
      ...validBindings,
      'garden-guardian-copy': validBindings['garden-guardian'],
    };
    expect(validateGardenModelBindings(duplicate, context).errors).toContain(
      'Garden model policy has multiple bindings for target kind guardian.',
    );
  });

  it('rejects unsupported target kinds and unknown asset/map references', () => {
    const invalid = structuredClone(validBindings);
    invalid['garden-guardian'].placement.targetKind = 'unknown';
    invalid['garden-lantern-base'].assetId = 'missing-asset';
    invalid['garden-lantern-base'].mapIds = ['missing-map'];
    const errors = validateGardenModelBindings(invalid, context).errors;
    expect(errors).toContain(
      'Model binding garden-guardian references unknown target kind unknown.',
    );
    expect(errors).toContain(
      'Model binding garden-lantern-base references unknown asset missing-asset.',
    );
    expect(errors).toContain(
      'Model binding garden-lantern-base references unknown map missing-map.',
    );
  });

  it('rejects map ownership that does not match actual target placement', () => {
    const mismatched = structuredClone(validBindings);
    mismatched['garden-guardian'].mapIds = ['village'];
    expect(validateGardenModelBindings(mismatched, context).errors).toContain(
      'Model binding garden-guardian map ownership does not match its actual scene placement.',
    );
  });

  it('rejects repeated map IDs in one binding', () => {
    const duplicateMap = structuredClone(validBindings);
    duplicateMap['garden-hero'].mapIds = ['village', 'village', 'garden'];
    expect(validateGardenModelBindings(duplicateMap, context).errors).toContain(
      'Model binding garden-hero repeats a map ID.',
    );
  });
});
