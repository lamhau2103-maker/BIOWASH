import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BatteryCharging,
  Contrast,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Hand,
  LayoutTemplate,
  Monitor,
  Moon,
  Palette,
  Pin,
  RotateCcw,
  Smartphone,
  Sparkles,
  Sun,
  Tablet,
  Upload,
} from 'lucide-react';
import { DeviceType } from '../hooks/useDevice';
import {
  ACCENT_PALETTES,
  AccentColorName,
  DashboardWidgetConfig,
  DensityScale,
  FontSizeScale,
  NavItemConfig,
  NavTabId,
  PresetLayoutName,
  ThemeMode,
  UIPreferences,
  WidgetSize,
} from '../hooks/useUIPreferences';
import { Site, SITE_TYPE_LABELS } from '../types/database';

interface UICustomizerPanelProps {
  deviceType: DeviceType;
  prefs: UIPreferences;
  sites: Site[];
  onUpdatePrefs: (patch: Partial<UIPreferences>) => void;
  onResetDefault: () => void;
  onApplyPreset: (preset: PresetLayoutName) => void;
  onExportCSV: () => void;
  onImportCSV: (file: File) => Promise<boolean>;
  onShowToast: (msg: string) => void;
}

const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  small: 'Nhỏ (4 cột)',
  medium: 'Vừa (6 cột)',
  large: 'Lớn (8 cột)',
  full: 'Toàn chiều rộng',
};

// Sortable Dashboard Widget Item
const SortableWidgetRow: React.FC<{
  widget: DashboardWidgetConfig;
  onToggleVisible: (id: DashboardWidgetConfig['id']) => void;
  onChangeSize: (id: DashboardWidgetConfig['id'], size: WidgetSize) => void;
}> = ({ widget, onToggleVisible, onChangeSize }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
        isDragging ? 'ring-2 ring-white/80 scale-[1.01]' : ''
      } ${!widget.visible ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none shrink-0"
          title="Kéo thả để đổi thứ tự"
        >
          <GripVertical className="w-5 h-5 text-white/80" />
        </button>
        <span className="text-xs sm:text-sm font-bold text-white truncate">{widget.label}</span>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        <select
          value={widget.size}
          onChange={(e) => onChangeSize(widget.id, e.target.value as WidgetSize)}
          className="min-h-[42px] px-2.5 rounded-xl glass-tool text-xs font-semibold"
        >
          {(Object.keys(WIDGET_SIZE_LABELS) as WidgetSize[]).map((sz) => (
            <option key={sz} value={sz}>
              {WIDGET_SIZE_LABELS[sz]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onToggleVisible(widget.id)}
          className={`min-h-[42px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
            widget.visible
              ? 'btn-accent'
              : 'bg-white/10 text-white/70 border border-white/20'
          }`}
        >
          {widget.visible ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Hiện</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              <span>Ẩn</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Sortable Navigation Tab Item
const SortableNavRow: React.FC<{
  item: NavItemConfig;
  isDefault: boolean;
  onToggleVisible: (id: NavTabId) => void;
  onSetDefault: (id: NavTabId) => void;
}> = ({ item, isDefault, onToggleVisible, onSetDefault }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card p-3 flex items-center justify-between gap-2 ${
        isDragging ? 'ring-2 ring-white/80' : ''
      }`}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="min-h-[42px] min-w-[42px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4 text-white/80" />
        </button>
        <span className="text-xs sm:text-sm font-bold text-white">{item.label}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSetDefault(item.id)}
          className={`min-h-[40px] px-3 rounded-xl text-xs font-bold transition ${
            isDefault
              ? 'btn-accent'
              : 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/20'
          }`}
        >
          {isDefault ? 'Tab mặc định ★' : 'Đặt mặc định'}
        </button>

        <button
          type="button"
          disabled={item.id === 'settings'}
          onClick={() => onToggleVisible(item.id)}
          className={`min-h-[40px] px-3 rounded-xl text-xs font-bold transition disabled:opacity-40 ${
            item.visible
              ? 'bg-emerald-500/25 border border-emerald-400/50 text-emerald-200'
              : 'bg-white/10 text-white/60 border border-white/20'
          }`}
        >
          {item.visible ? 'Hiện' : 'Ẩn'}
        </button>
      </div>
    </div>
  );
};

export const UICustomizerPanel: React.FC<UICustomizerPanelProps> = ({
  deviceType,
  prefs,
  sites,
  onUpdatePrefs,
  onResetDefault,
  onApplyPreset,
  onExportCSV,
  onImportCSV,
  onShowToast,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleWidgetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = prefs.dashboardWidgets.findIndex((w) => w.id === active.id);
    const newIndex = prefs.dashboardWidgets.findIndex((w) => w.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onUpdatePrefs({
        dashboardWidgets: arrayMove(prefs.dashboardWidgets, oldIndex, newIndex),
      });
    }
  };

  const handleNavDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = prefs.navItems.findIndex((n) => n.id === active.id);
    const newIndex = prefs.navItems.findIndex((n) => n.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onUpdatePrefs({
        navItems: arrayMove(prefs.navItems, oldIndex, newIndex),
      });
    }
  };

  const togglePinnedSite = (siteId: string) => {
    const exists = prefs.pinnedSiteIds.includes(siteId);
    if (exists) {
      onUpdatePrefs({
        pinnedSiteIds: prefs.pinnedSiteIds.filter((id) => id !== siteId),
      });
    } else {
      if (prefs.pinnedSiteIds.length >= 4) {
        onShowToast('Chỉ có thể ghim tối đa 4 điểm rửa xe làm lối tắt nhanh.');
        return;
      }
      onUpdatePrefs({
        pinnedSiteIds: [...prefs.pinnedSiteIds, siteId],
      });
    }
  };

  const activeSites = sites.filter((s) => s.is_active);

  return (
    <div className="space-y-5">
      {/* Header + Device Profile Badge + Live Preview Strip */}
      <div className="glass-card density-pad space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-300" />
              <h3 className="fluid-title font-bold text-white">
                Tùy Biến Giao Diện & Xem Trước Trực Tiếp
              </h3>
            </div>
            <p className="text-xs text-white/80">
              Cấu hình đang lưu riêng cho thiết bị:{' '}
              <strong className="text-teal-200 uppercase">
                {deviceType === 'mobile'
                  ? 'Điện thoại (ui_prefs_mobile)'
                  : deviceType === 'tablet'
                  ? 'Máy tính bảng (ui_prefs_tablet)'
                  : 'Laptop/Máy bàn (ui_prefs_desktop)'}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExportCSV}
              className="min-h-[44px] px-3.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Xuất CSV</span>
            </button>

            <label className="min-h-[44px] px-3.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Nhập CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const ok = await onImportCSV(file);
                  onShowToast(
                    ok
                      ? 'Đã nhập cấu hình giao diện thành công!'
                      : 'Tệp cấu hình không hợp lệ, đã tự khôi phục về mặc định.'
                  );
                  e.target.value = '';
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => {
                onResetDefault();
                onShowToast('Đã khôi phục giao diện mặc định cho thiết bị này.');
              }}
              className="min-h-[44px] px-3.5 rounded-2xl bg-rose-500/25 hover:bg-rose-500/35 border border-rose-300/40 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Khôi phục mặc định</span>
            </button>
          </div>
        </div>

        {/* LIVE GLASS PREVIEW BOX */}
        <div className="p-4 rounded-3xl border border-white/75 bg-white/35 backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between text-xs text-white/80">
            <span className="font-semibold flex items-center gap-1.5">
              {deviceType === 'mobile' ? (
                <Smartphone className="w-4 h-4" />
              ) : deviceType === 'tablet' ? (
                <Tablet className="w-4 h-4" />
              ) : (
                <Monitor className="w-4 h-4" />
              )}
              Xem trước trực tiếp hiệu ứng Kính Mờ (Blur {prefs.glassBlur}px · Alpha{' '}
              {prefs.glassOpacity}%)
            </span>
            <span className="font-mono">
              Cỡ chữ: {prefs.fontSize} · Mật độ: {prefs.density}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass-card p-3.5 glow-pass flex items-center justify-between">
              <div>
                <div className="text-xs text-white/80">Trạng thái Đạt</div>
                <div className="text-lg font-bold font-mono text-emerald-300">96.4%</div>
              </div>
              <span className="px-3 py-1.5 rounded-xl btn-accent text-xs font-bold">
                Màu chủ đạo
              </span>
            </div>
            <div className="glass-card p-3.5 glow-warn flex items-center justify-between">
              <div>
                <div className="text-xs text-white/80">Cảnh báo Hổ phách</div>
                <div className="text-lg font-bold font-mono text-amber-300">82.0%</div>
              </div>
              <span className="text-xs font-semibold text-amber-200">Cần cải thiện</span>
            </div>
            <div className="glass-card p-3.5 glow-fail flex items-center justify-between">
              <div>
                <div className="text-xs text-white/80">Không đạt Coral</div>
                <div className="text-lg font-bold font-mono text-rose-300">68.5%</div>
              </div>
              <span className="text-xs font-semibold text-rose-200">Xử lý ngay</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. THEME, ACCENT COLOR, GLASS SLIDERS, FONT & DENSITY */}
      <div className="glass-card density-pad space-y-5">
        <div className="flex items-center gap-2 text-base font-bold text-white">
          <Palette className="w-5 h-5 text-teal-300" />
          <span>1. Giao Diện, Độ Mờ Kính & Khả Năng Đọc Ngoài Trời</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Theme Mode */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-white/90">Chế độ Sáng / Tối</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'light', label: 'Sáng', icon: Sun },
                  { id: 'dark', label: 'Tối', icon: Moon },
                  { id: 'auto', label: 'Tự động', icon: Sparkles },
                ] as Array<{ id: ThemeMode; label: string; icon: React.FC<{ className?: string }> }>
              ).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onUpdatePrefs({ themeMode: m.id })}
                    className={`min-h-[48px] rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      prefs.themeMode === m.id
                        ? 'btn-accent'
                        : 'bg-white/10 text-white/80 border border-white/20 hover:bg-white/20'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent Color */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-white/90">Màu chủ đạo (Accent)</label>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(ACCENT_PALETTES) as AccentColorName[]).map((colorKey) => {
                const pal = ACCENT_PALETTES[colorKey];
                const active = prefs.accentColor === colorKey;
                return (
                  <button
                    key={colorKey}
                    type="button"
                    onClick={() => onUpdatePrefs({ accentColor: colorKey })}
                    className={`min-h-[48px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 border transition ${
                      active
                        ? 'border-white bg-white/25 text-white scale-105 shadow-lg'
                        : 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/60 shrink-0"
                      style={{ background: pal.primary }}
                    />
                    <span>{pal.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Blur Slider (8 - 32px) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-white/90">
              <span>Độ mờ kính (Backdrop Blur)</span>
              <span className="font-mono">{prefs.glassBlur}px</span>
            </div>
            <input
              type="range"
              min={8}
              max={32}
              step={1}
              value={prefs.glassBlur}
              onChange={(e) => onUpdatePrefs({ glassBlur: Number(e.target.value) })}
              className="w-full h-2.5 rounded-lg cursor-pointer accent-teal-400"
            />
            <div className="flex justify-between text-[11px] text-white/60 font-mono">
              <span>8px (Nhẹ)</span>
              <span>20px (Chuẩn)</span>
              <span>32px (Sâu)</span>
            </div>
          </div>

          {/* Opacity Slider (10 - 28%) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-white/90">
              <span>Độ trong suốt nền kính (Alpha)</span>
              <span className="font-mono">{prefs.glassOpacity}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={28}
              step={1}
              value={prefs.glassOpacity}
              onChange={(e) => onUpdatePrefs({ glassOpacity: Number(e.target.value) })}
              className="w-full h-2.5 rounded-lg cursor-pointer accent-teal-400"
            />
            <div className="flex justify-between text-[11px] text-white/60 font-mono">
              <span>10% (Trong)</span>
              <span>15% (Chuẩn)</span>
              <span>28% (Đậm)</span>
            </div>
          </div>

          {/* Font Size Scale */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-white/90">Cỡ chữ toàn ứng dụng</label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'small', label: 'Nhỏ' },
                  { id: 'medium', label: 'Vừa' },
                  { id: 'large', label: 'Lớn' },
                  { id: 'xlarge', label: 'Rất lớn' },
                ] as Array<{ id: FontSizeScale; label: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onUpdatePrefs({ fontSize: f.id })}
                  className={`min-h-[46px] rounded-2xl text-xs font-bold transition ${
                    prefs.fontSize === f.id
                      ? 'btn-accent'
                      : 'bg-white/10 text-white/80 border border-white/20'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Density Scale */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-white/90">Mật độ hiển thị</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'spacious', label: 'Thoáng' },
                  { id: 'standard', label: 'Chuẩn' },
                  { id: 'compact', label: 'Gọn' },
                ] as Array<{ id: DensityScale; label: string }>
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onUpdatePrefs({ density: d.id })}
                  className={`min-h-[46px] rounded-2xl text-xs font-bold transition ${
                    prefs.density === d.id
                      ? 'btn-accent'
                      : 'bg-white/10 text-white/80 border border-white/20'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Special Field Modes: High Contrast, Power Saving, One-Handed */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => onUpdatePrefs({ highContrast: !prefs.highContrast })}
            className={`min-h-[52px] p-3.5 rounded-2xl text-left flex items-center justify-between border transition ${
              prefs.highContrast
                ? 'btn-accent border-white'
                : 'bg-white/10 border-white/20 text-white/85'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Contrast className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-xs font-bold">Tương phản cao</div>
                <div className="text-[11px] opacity-80">Đọc rõ ngoài nắng gắt</div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold">
              {prefs.highContrast ? 'BẬT' : 'TẮT'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onUpdatePrefs({ powerSaving: !prefs.powerSaving })}
            className={`min-h-[52px] p-3.5 rounded-2xl text-left flex items-center justify-between border transition ${
              prefs.powerSaving
                ? 'btn-accent border-white'
                : 'bg-white/10 border-white/20 text-white/85'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BatteryCharging className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-xs font-bold">Tiết kiệm pin</div>
                <div className="text-[11px] opacity-80">Tắt blob động & giảm blur</div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold">
              {prefs.powerSaving ? 'BẬT' : 'TẮT'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onUpdatePrefs({ oneHandedMode: !prefs.oneHandedMode })}
            className={`min-h-[52px] p-3.5 rounded-2xl text-left flex items-center justify-between border transition ${
              prefs.oneHandedMode
                ? 'btn-accent border-white'
                : 'bg-white/10 border-white/20 text-white/85'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Hand className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-xs font-bold">Dùng một tay</div>
                <div className="text-[11px] opacity-80">Hạ thấp vùng thao tác chính</div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold">
              {prefs.oneHandedMode ? 'BẬT' : 'TẮT'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. DASHBOARD LAYOUT PRESETS & DRAG-AND-DROP WIDGETS */}
      <div className="glass-card density-pad space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <LayoutTemplate className="w-5 h-5 text-teal-300" />
            <span>2. Bố Cục Dashboard (Kéo-Thả Đổi Thứ Tự & Cỡ Khối)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/80">3 mẫu dựng sẵn:</span>
            <button
              type="button"
              onClick={() => {
                onApplyPreset('compact_fast');
                onShowToast('Đã áp dụng bố cục: Gọn nhanh');
              }}
              className="min-h-[40px] px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-bold text-white"
            >
              Gọn nhanh
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyPreset('balanced');
                onShowToast('Đã áp dụng bố cục: Cân bằng');
              }}
              className="min-h-[40px] px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-bold text-white"
            >
              Cân bằng
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyPreset('analytics');
                onShowToast('Đã áp dụng bố cục: Phân tích chuyên sâu');
              }}
              className="min-h-[40px] px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-bold text-white"
            >
              Phân tích
            </button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleWidgetDragEnd}
        >
          <SortableContext
            items={prefs.dashboardWidgets.map((w) => w.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {prefs.dashboardWidgets.map((w) => (
                <SortableWidgetRow
                  key={w.id}
                  widget={w}
                  onToggleVisible={(id) => {
                    onUpdatePrefs({
                      dashboardWidgets: prefs.dashboardWidgets.map((item) =>
                        item.id === id ? { ...item, visible: !item.visible } : item
                      ),
                    });
                  }}
                  onChangeSize={(id, size) => {
                    onUpdatePrefs({
                      dashboardWidgets: prefs.dashboardWidgets.map((item) =>
                        item.id === id ? { ...item, size } : item
                      ),
                    });
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* 3. NAVIGATION TABS ORDER & DEFAULT TAB */}
      <div className="glass-card density-pad space-y-4">
        <div>
          <h4 className="text-base font-bold text-white">
            3. Thanh Điều Hướng (Dock Điện Thoại / Sidebar Máy Tính)
          </h4>
          <p className="text-xs text-white/80">
            Kéo-thả để sắp xếp thứ tự các tab (tối đa 5 tab trên điện thoại) và chọn tab mở mặc định sau khi đăng nhập.
          </p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleNavDragEnd}
        >
          <SortableContext
            items={prefs.navItems.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {prefs.navItems.map((n) => (
                <SortableNavRow
                  key={n.id}
                  item={n}
                  isDefault={prefs.defaultTab === n.id}
                  onToggleVisible={(id) => {
                    if (id === 'settings') return;
                    onUpdatePrefs({
                      navItems: prefs.navItems.map((item) =>
                        item.id === id ? { ...item, visible: !item.visible } : item
                      ),
                    });
                  }}
                  onSetDefault={(id) => {
                    onUpdatePrefs({
                      defaultTab: id,
                      navItems: prefs.navItems.map((item) =>
                        item.id === id ? { ...item, visible: true } : item
                      ),
                    });
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* 4. PINNED WASH SITES SHORTCUTS (MAX 4) */}
      <div className="glass-card density-pad space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Pin className="w-5 h-5 text-teal-300" />
            <span>4. Ghim Lối Tắt Điểm Rửa Xe Hay Dùng ({prefs.pinnedSiteIds.length}/4)</span>
          </div>
          <span className="text-xs text-white/75">Bấm để vào kiểm tra 1 chạm từ Tổng quan</span>
        </div>

        {activeSites.length === 0 ? (
          <p className="text-xs text-white/70">Chưa có điểm rửa xe nào để ghim.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {activeSites.map((s) => {
              const isPinned = prefs.pinnedSiteIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => togglePinnedSite(s.id)}
                  className={`min-h-[48px] px-4 py-2.5 rounded-2xl text-left flex items-center justify-between border transition ${
                    isPinned
                      ? 'btn-accent border-white'
                      : 'bg-white/10 border-white/20 text-white/85 hover:bg-white/20'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="text-xs sm:text-sm font-bold truncate">{s.name}</div>
                    <div className="text-[11px] opacity-80">{SITE_TYPE_LABELS[s.site_type]}</div>
                  </div>
                  <span className="text-xs font-bold shrink-0">
                    {isPinned ? 'Đã ghim ★' : '+ Ghim'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
