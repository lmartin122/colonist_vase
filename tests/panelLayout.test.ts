import { describe, expect, it } from 'vitest';
import { clampDockHandHeight, clampDockHandPercent, migratePanelLayoutRecord } from '../src/ui/panelLayout';

describe('panel layout persistence', () => {
  it('keeps valid dock settings while discarding obsolete sidebar fields', () => {
    expect(migratePanelLayoutRecord({ sidebar: [25, 19, 10, 46], handPercent: 40, handHeight: 110 })).toEqual({
      version: 2,
      handPercent: 40,
      handHeight: 110,
    });
  });

  it('clamps both dock orientations before either pane becomes unusable', () => {
    expect(clampDockHandPercent(1280, 90)).toBeCloseTo(58.59375);
    expect(clampDockHandPercent(1280, 1)).toBeCloseTo(17.1875);
    expect(clampDockHandHeight(600, 300, 90)).toBe(240);
    expect(clampDockHandHeight(260, 200, 90)).toBe(70);
  });
});
