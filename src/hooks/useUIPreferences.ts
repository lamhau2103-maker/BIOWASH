import { useCallback, useEffect, useState } from 'react';
import { DeviceType } from './useDevice';

export type NavTabId = 'overview' | 'inspect' | 'actions' | 'history' | 'settings';

export type DashboardWidgetId =
  | 'pinned_shortcuts'
  | 'kpi_strip'
  | 'site_comparison'
  | 'urgent_actions'
  | 'sites_status'
  | 'chart_trend'
  | 'chart_ranking'
  | 'chart_top_violations'
  | 'chart_group_donut'
  | 'chart_vehicles'
  | 'chart_heatmap_sla';

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

export type AccentColorName = 'teal' | 'blue' | 'green' | 'purple' | 'orange';

export type FontSizeScale = 'small' | 'medium' | 'large' | 'xlarge';

export type DensityScale = 'spacious' | 'standard' | 'compact';

export type ThemeMode = 'light' | 'dark' | 'auto';

export type PresetLayoutName = 'compact_fast' | 'balanced' | 'analytics';

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  label: string;
  visible: boolean;
  size: WidgetSize;
}

export interface NavItemConfig {
  id: NavTabId;
  label: string;
  visible: boolean;
}

export interface UIPreferences {
  themeMode: ThemeMode;
  accentColor: AccentColorName;
  glassBlur: number; // 8 - 32 px
  glassOpacity: number; // 12 - 28 (%)
  fontSize: FontSizeScale;
  density: DensityScale;
  highContrast: boolean;
  powerSaving: boolean;
  oneHandedMode: boolean;
  sidebarCollapsed: boolean;
  defaultTab: NavTabId;
  navItems: NavItemConfig[];
  dashboardWidgets: DashboardWidgetConfig[];
  pinnedSiteIds: string[]; // Max 4
}

export const ACCENT_PALETTES: Record<
  AccentColorName,
  { label: string; primary: string; secondary: string; glow: string }
> = {
  teal: {
    label: 'Xanh Ngọc (Teal)',
    primary: '#0d9488',
    secondary: '#06b6d4',
    glow: 'rgba(20, 184, 166, 0.38)',
  },
  blue: {
    label: 'Xanh Apple iOS (#007AFF)',
    primary: '#007AFF',
    secondary: '#38bdf8',
    glow: 'rgba(0, 122, 255, 0.42)',
  },
  green: {
    label: 'Xanh Lá iOS (#34C759)',
    primary: '#10b981',
    secondary: '#34d399',
    glow: 'rgba(52, 199, 89, 0.38)',
  },
  purple: {
    label: 'Tím iOS (#AF52DE)',
    primary: '#8b5cf6',
    secondary: '#a855f7',
    glow: 'rgba(175, 82, 222, 0.38)',
  },
  orange: {
    label: 'Cam iOS (#FF9500)',
    primary: '#f97316',
    secondary: '#fbbf24',
    glow: 'rgba(255, 149, 0, 0.38)',
  },
};

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetConfig[] = [
  { id: 'pinned_shortcuts', label: 'Lối tắt điểm rửa xe ghim nhanh', visible: true, size: 'full' },
  { id: 'kpi_strip', label: '6 Thẻ KPI Tổng quan', visible: true, size: 'full' },
  { id: 'site_comparison', label: 'Biểu đồ so sánh giữa các điểm rửa xe', visible: true, size: 'full' },
  { id: 'urgent_actions', label: 'Khối CẦN XỬ LÝ NGAY', visible: true, size: 'full' },
  { id: 'sites_status', label: 'Trạng thái các điểm (Lưới thẻ / Bản đồ)', visible: true, size: 'full' },
  { id: 'chart_trend', label: 'Biểu đồ 1: Xu hướng điểm tuân thủ', visible: true, size: 'medium' },
  { id: 'chart_ranking', label: 'Biểu đồ 2: Xếp hạng các điểm rửa xe', visible: true, size: 'medium' },
  { id: 'chart_top_violations', label: 'Biểu đồ 3: Top 10 hạng mục hay vi phạm', visible: true, size: 'medium' },
  { id: 'chart_group_donut', label: 'Biểu đồ 4: Donut tỷ trọng lỗi theo 6 nhóm', visible: true, size: 'medium' },
  { id: 'chart_vehicles', label: 'Biểu đồ 5: Lượt xe theo loại & Đạt/Không đạt', visible: true, size: 'medium' },
  { id: 'chart_heatmap_sla', label: 'Biểu đồ 6 & 7: Heatmap Điểm × Tuần & Hiệu suất đóng lỗi', visible: true, size: 'medium' },
];

export const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Tổng quan', visible: true },
  { id: 'inspect', label: 'Kiểm tra', visible: true },
  { id: 'actions', label: 'Lỗi', visible: true },
  { id: 'history', label: 'Lịch sử', visible: true },
  { id: 'settings', label: 'Cài đặt', visible: true },
];

export function getDefaultUIPreferences(
  deviceType: DeviceType,
  prefersReducedMotion = false
): UIPreferences {
  return {
    themeMode: 'light',
    accentColor: 'blue',
    glassBlur: 32,
    glassOpacity: 24,
    fontSize: 'medium',
    density: deviceType === 'mobile' ? 'compact' : 'standard',
    highContrast: false,
    powerSaving: prefersReducedMotion,
    oneHandedMode: false,
    sidebarCollapsed: deviceType === 'tablet',
    defaultTab: 'overview',
    navItems: DEFAULT_NAV_ITEMS.map((item) => ({ ...item })),
    dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w })),
    pinnedSiteIds: [],
  };
}

function getStorageKey(deviceType: DeviceType): string {
  if (deviceType === 'mobile') return 'ui_prefs_v5_ios_mobile';
  if (deviceType === 'tablet') return 'ui_prefs_v5_ios_tablet';
  return 'ui_prefs_v5_ios_desktop';
}

function sanitizePreferences(raw: unknown, deviceType: DeviceType, prefersReducedMotion: boolean): UIPreferences {
  const def = getDefaultUIPreferences(deviceType, prefersReducedMotion);
  if (!raw || typeof raw !== 'object') return def;
  const obj = raw as Partial<UIPreferences>;

  const validThemes: ThemeMode[] = ['light', 'dark', 'auto'];
  const validAccents: AccentColorName[] = ['teal', 'blue', 'green', 'purple', 'orange'];
  const validFonts: FontSizeScale[] = ['small', 'medium', 'large', 'xlarge'];
  const validDensities: DensityScale[] = ['spacious', 'standard', 'compact'];
  const validTabs: NavTabId[] = ['overview', 'inspect', 'actions', 'history', 'settings'];
  const validSizes: WidgetSize[] = ['small', 'medium', 'large', 'full'];

  // Merge dashboard widgets preserving saved order and ensuring all default IDs exist
  let mergedWidgets = def.dashboardWidgets;
  if (Array.isArray(obj.dashboardWidgets)) {
    const byId = new Map<DashboardWidgetId, DashboardWidgetConfig>();
    def.dashboardWidgets.forEach((w) => byId.set(w.id, { ...w }));
    const ordered: DashboardWidgetConfig[] = [];
    obj.dashboardWidgets.forEach((w) => {
      if (w && typeof w === 'object' && byId.has(w.id)) {
        const base = byId.get(w.id)!;
        ordered.push({
          id: base.id,
          label: base.label,
          visible: typeof w.visible === 'boolean' ? w.visible : base.visible,
          size: validSizes.includes(w.size) ? w.size : base.size,
        });
        byId.delete(w.id);
      }
    });
    byId.forEach((rem) => ordered.push(rem));
    mergedWidgets = ordered;
  }

  // Merge nav items preserving saved order and ensuring settings is always reachable
  let mergedNav = def.navItems;
  if (Array.isArray(obj.navItems)) {
    const byId = new Map<NavTabId, NavItemConfig>();
    def.navItems.forEach((n) => byId.set(n.id, { ...n }));
    const ordered: NavItemConfig[] = [];
    obj.navItems.forEach((n) => {
      if (n && typeof n === 'object' && byId.has(n.id)) {
        const base = byId.get(n.id)!;
        ordered.push({
          id: base.id,
          label: base.label,
          visible: n.id === 'settings' ? true : typeof n.visible === 'boolean' ? n.visible : base.visible,
        });
        byId.delete(n.id);
      }
    });
    byId.forEach((rem) => ordered.push(rem));
    mergedNav = ordered;
  }

  return {
    themeMode: validThemes.includes(obj.themeMode as ThemeMode) ? (obj.themeMode as ThemeMode) : def.themeMode,
    accentColor: validAccents.includes(obj.accentColor as AccentColorName)
      ? (obj.accentColor as AccentColorName)
      : def.accentColor,
    glassBlur:
      typeof obj.glassBlur === 'number' && Number.isFinite(obj.glassBlur)
        ? Math.min(32, Math.max(8, obj.glassBlur))
        : def.glassBlur,
    glassOpacity:
      typeof obj.glassOpacity === 'number' && Number.isFinite(obj.glassOpacity)
        ? Math.min(30, Math.max(8, obj.glassOpacity))
        : def.glassOpacity,
    fontSize: validFonts.includes(obj.fontSize as FontSizeScale) ? (obj.fontSize as FontSizeScale) : def.fontSize,
    density: validDensities.includes(obj.density as DensityScale) ? (obj.density as DensityScale) : def.density,
    highContrast: typeof obj.highContrast === 'boolean' ? obj.highContrast : def.highContrast,
    powerSaving: typeof obj.powerSaving === 'boolean' ? obj.powerSaving : def.powerSaving,
    oneHandedMode: typeof obj.oneHandedMode === 'boolean' ? obj.oneHandedMode : def.oneHandedMode,
    sidebarCollapsed:
      typeof obj.sidebarCollapsed === 'boolean' ? obj.sidebarCollapsed : def.sidebarCollapsed,
    defaultTab: validTabs.includes(obj.defaultTab as NavTabId) ? (obj.defaultTab as NavTabId) : def.defaultTab,
    navItems: mergedNav,
    dashboardWidgets: mergedWidgets,
    pinnedSiteIds: Array.isArray(obj.pinnedSiteIds)
      ? obj.pinnedSiteIds.filter((x): x is string => typeof x === 'string').slice(0, 4)
      : [],
  };
}

export function useUIPreferences(deviceType: DeviceType, prefersReducedMotion: boolean) {
  const [prefs, setPrefs] = useState<UIPreferences>(() => {
    try {
      const key = getStorageKey(deviceType);
      const raw = localStorage.getItem(key);
      if (!raw) return getDefaultUIPreferences(deviceType, prefersReducedMotion);
      return sanitizePreferences(JSON.parse(raw), deviceType, prefersReducedMotion);
    } catch {
      return getDefaultUIPreferences(deviceType, prefersReducedMotion);
    }
  });

  // Reload device-specific preferences when switching between mobile / tablet / desktop
  useEffect(() => {
    try {
      const key = getStorageKey(deviceType);
      const raw = localStorage.getItem(key);
      if (!raw) {
        setPrefs(getDefaultUIPreferences(deviceType, prefersReducedMotion));
      } else {
        setPrefs(sanitizePreferences(JSON.parse(raw), deviceType, prefersReducedMotion));
      }
    } catch {
      setPrefs(getDefaultUIPreferences(deviceType, prefersReducedMotion));
    }
  }, [deviceType, prefersReducedMotion]);

  // Persist to localStorage (UI prefs only) and apply CSS variables instantaneously
  useEffect(() => {
    try {
      const key = getStorageKey(deviceType);
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }

    const root = document.documentElement;
    const palette = ACCENT_PALETTES[prefs.accentColor] || ACCENT_PALETTES.teal;

    // Keep the entire app unified in the bright, luminous iOS translucent theme like LoginScreen
    root.classList.remove('dark');

    root.classList.toggle('high-contrast-glass', prefs.highContrast);
    root.classList.toggle('power-saving-mode', prefs.powerSaving);
    root.classList.toggle('one-handed-mode', prefs.oneHandedMode);

    // Apply CSS variables for instant updates without re-creating the DOM tree
    const effectiveBlur = prefs.powerSaving ? Math.min(8, prefs.glassBlur) : prefs.glassBlur;
    const baseAlpha = prefs.highContrast
      ? Math.min(0.32, prefs.glassOpacity / 100 + 0.08)
      : prefs.glassOpacity / 100;

    root.style.setProperty('--accent-primary', palette.primary);
    root.style.setProperty('--accent-secondary', palette.secondary);
    root.style.setProperty('--accent-glow', palette.glow);
    root.style.setProperty('--glass-blur', `${effectiveBlur}px`);
    root.style.setProperty('--glass-alpha', String(baseAlpha));
    root.style.setProperty(
      '--glass-scrim',
      prefs.highContrast ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.14)'
    );

    const fontMap: Record<FontSizeScale, string> = {
      small: '14px',
      medium: '16px',
      large: '17.5px',
      xlarge: '19px',
    };
    root.style.setProperty('--base-font-size', fontMap[prefs.fontSize]);

    const densityGapMap: Record<DensityScale, string> = {
      compact: '0.75rem',
      standard: '1.125rem',
      spacious: '1.5rem',
    };
    const densityPadMap: Record<DensityScale, string> = {
      compact: '0.9rem',
      standard: '1.25rem',
      spacious: '1.65rem',
    };
    root.style.setProperty('--ui-gap', densityGapMap[prefs.density]);
    root.style.setProperty('--ui-card-pad', densityPadMap[prefs.density]);
  }, [prefs, deviceType]);

  const updatePrefs = useCallback((patch: Partial<UIPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetToDefault = useCallback(() => {
    const def = getDefaultUIPreferences(deviceType, prefersReducedMotion);
    setPrefs(def);
  }, [deviceType, prefersReducedMotion]);

  const applyPresetLayout = useCallback((preset: PresetLayoutName) => {
    setPrefs((prev) => {
      if (preset === 'compact_fast') {
        return {
          ...prev,
          density: 'compact',
          dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS.map((w) => ({
            ...w,
            visible: [
              'pinned_shortcuts',
              'kpi_strip',
              'site_comparison',
              'urgent_actions',
              'sites_status',
            ].includes(w.id),
            size: 'full',
          })),
        };
      }
      if (preset === 'analytics') {
        return {
          ...prev,
          density: 'standard',
          dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS.map((w) => ({
            ...w,
            visible: true,
            size: w.id.startsWith('chart_') ? 'small' : 'full',
          })),
        };
      }
      // 'balanced'
      return {
        ...prev,
        density: 'standard',
        dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w })),
      };
    });
  }, []);

  const exportPrefsToCSV = useCallback(() => {
    const rows: Array<[string, string]> = [
      ['key', 'value'],
      ['deviceType', deviceType],
      ['themeMode', prefs.themeMode],
      ['accentColor', prefs.accentColor],
      ['glassBlur', String(prefs.glassBlur)],
      ['glassOpacity', String(prefs.glassOpacity)],
      ['fontSize', prefs.fontSize],
      ['density', prefs.density],
      ['highContrast', String(prefs.highContrast)],
      ['powerSaving', String(prefs.powerSaving)],
      ['oneHandedMode', String(prefs.oneHandedMode)],
      ['sidebarCollapsed', String(prefs.sidebarCollapsed)],
      ['defaultTab', prefs.defaultTab],
      ['pinnedSiteIds', JSON.stringify(prefs.pinnedSiteIds)],
      ['navItems', JSON.stringify(prefs.navItems)],
      ['dashboardWidgets', JSON.stringify(prefs.dashboardWidgets)],
    ];
    const csvContent = rows
      .map(([k, v]) => `"${k.replace(/"/g, '""')}","${v.replace(/"/g, '""')}"`)
      .join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BioWash_TuyBienGiaoDien_${deviceType}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [prefs, deviceType]);

  const importPrefsFromCSV = useCallback(
    async (file: File): Promise<boolean> => {
      try {
        const text = await file.text();
        const lines = text
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        const parsedObj: Record<string, unknown> = {};

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const match = line.match(/^"([^"]*)","(.*)"$/);
          if (!match) continue;
          const k = match[1].replace(/""/g, '"');
          const v = match[2].replace(/""/g, '"');
          if (k === 'glassBlur' || k === 'glassOpacity') {
            parsedObj[k] = Number(v);
          } else if (
            k === 'highContrast' ||
            k === 'powerSaving' ||
            k === 'oneHandedMode' ||
            k === 'sidebarCollapsed'
          ) {
            parsedObj[k] = v === 'true';
          } else if (k === 'pinnedSiteIds' || k === 'navItems' || k === 'dashboardWidgets') {
            parsedObj[k] = JSON.parse(v);
          } else {
            parsedObj[k] = v;
          }
        }

        const sanitized = sanitizePreferences(parsedObj, deviceType, prefersReducedMotion);
        setPrefs(sanitized);
        return true;
      } catch {
        // Corrupted CSV -> fall back to default as required
        setPrefs(getDefaultUIPreferences(deviceType, prefersReducedMotion));
        return false;
      }
    },
    [deviceType, prefersReducedMotion]
  );

  return {
    prefs,
    updatePrefs,
    resetToDefault,
    applyPresetLayout,
    exportPrefsToCSV,
    importPrefsFromCSV,
  };
}
