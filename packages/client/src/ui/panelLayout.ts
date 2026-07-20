const PANEL_LAYOUT_V1_KEY = 'colonist-vase.panel-layout.v1';
const PANEL_LAYOUT_V2_KEY = 'colonist-vase.panel-layout.v2';

export interface PanelLayout {
  version: 2;
  handPercent: number;
  handHeight: number;
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  version: 2,
  handPercent: 38,
  handHeight: 92,
};

export function migratePanelLayoutRecord(value: unknown): PanelLayout {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PANEL_LAYOUT };
  const record = value as { handPercent?: unknown; handHeight?: unknown };
  return {
    version: 2,
    handPercent: typeof record.handPercent === 'number' && record.handPercent >= 20 && record.handPercent <= 65
      ? record.handPercent
      : DEFAULT_PANEL_LAYOUT.handPercent,
    handHeight: typeof record.handHeight === 'number' && record.handHeight >= 70 && record.handHeight <= 240
      ? record.handHeight
      : DEFAULT_PANEL_LAYOUT.handHeight,
  };
}

export function loadPanelLayout(): PanelLayout {
  if (typeof localStorage === 'undefined') return migratePanelLayoutRecord(null);
  try {
    const current = localStorage.getItem(PANEL_LAYOUT_V2_KEY);
    if (current) return migratePanelLayoutRecord(JSON.parse(current));
    const legacy = localStorage.getItem(PANEL_LAYOUT_V1_KEY);
    const migrated = migratePanelLayoutRecord(legacy ? JSON.parse(legacy) : null);
    if (legacy) localStorage.setItem(PANEL_LAYOUT_V2_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return migratePanelLayoutRecord(null);
  }
}

export function savePanelLayout(patch: Partial<Omit<PanelLayout, 'version'>>): void {
  if (typeof localStorage === 'undefined') return;
  const current = loadPanelLayout();
  localStorage.setItem(PANEL_LAYOUT_V2_KEY, JSON.stringify({ ...current, ...patch, version: 2 }));
}

export function clampDockHandPercent(width: number, desired: number, dividerSize = 10): number {
  if (width <= 0) return DEFAULT_PANEL_LAYOUT.handPercent;
  const minimum = (220 / width) * 100;
  const maximum = ((width - dividerSize - 520) / width) * 100;
  return Math.min(Math.max(minimum, maximum), Math.max(minimum, Math.min(maximum, desired)));
}

export function clampDockHandHeight(viewportHeight: number, desired: number, actionHeight: number): number {
  const maximum = Math.min(240, Math.max(70, viewportHeight - actionHeight - 120));
  return Math.min(maximum, Math.max(70, desired));
}
