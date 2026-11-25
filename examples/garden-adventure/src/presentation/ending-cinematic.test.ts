import { describe, expect, it } from 'vitest';
import { createGardenEndingTimeline, gardenEndingRegistry } from './ending-cinematic.js';

describe('Garden ending timelines', () => {
  it('stages the tree outcome with its authored animation and dialogue', () => {
    const timeline = createGardenEndingTimeline('ending-garden');
    expect(timeline.registry).toEqual(gardenEndingRegistry);
    expect(timeline.cues.map((cue) => cue.kind)).toEqual(['camera', 'animation', 'dialogue']);
    expect(timeline.cues[1]).toMatchObject({ actorId: 'hero', action: 'interact' });
    expect(timeline.registry.dialogues['tree-ending']?.text).toContain('دانه جوانه زد');
  });

  it('stages the lantern outcome with the guardian and its authored dialogue', () => {
    const timeline = createGardenEndingTimeline('ending-lantern');
    expect(timeline.cues[1]).toMatchObject({ actorId: 'guardian', action: 'interact' });
    expect(timeline.registry.dialogues['lantern-ending']?.text).toContain('فانوس روشن شد');
  });
});
