import React, { useState } from 'react';
import {
  Building2,
  CloudUpload,
  Database,
  Keyboard,
  LogOut,
  Sliders,
  Sparkles,
  Timer,
} from 'lucide-react';
import { DeviceType } from '../hooks/useDevice';
import { PresetLayoutName, UIPreferences } from '../hooks/useUIPreferences';
import { AppSettings, Profile, Site } from '../types/database';
import { PWAInstallButton } from './CommonUI';
import { UICustomizerPanel } from './UICustomizerPanel';

interface SettingsViewProps {
  profile: Profile;
  deviceType: DeviceType;
  sites: Site[];
  settings: AppSettings;
  uiPrefs: UIPreferences;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateUIPrefs: (patch: Partial<UIPreferences>) => void;
  onResetUIPrefs: () => void;
  onApplyPreset: (preset: PresetLayoutName) => void;
  onExportUICSV: () => void;
  onImportUICSV: (file: File) => Promise<boolean>;
  onOpenManageSites: () => void;
  onShowToast: (msg: string) => void;
  onLogout: () => void;
  onSyncLegacyData?: () => void;
  isSyncingLegacy?: boolean;
  onOpenSqlModal?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  deviceType,
  sites,
  settings,
  uiPrefs,
  onUpdateSettings,
  onUpdateUIPrefs,
  onResetUIPrefs,
  onApplyPreset,
  onExportUICSV,
  onImportUICSV,
  onOpenManageSites,
  onShowToast,
  onLogout,
  onSyncLegacyData,
  isSyncingLegacy,
  onOpenSqlModal,
}) => {
  const [subTab, setSubTab] = useState<'customizer' | 'system'>('customizer');

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Top Account Card & Sub-navigation */}
      <div className="glass-card density-pad flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl btn-accent flex items-center justify-center text-white font-bold text-xl shrink-0">
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="fluid-title font-bold text-white">{profile.full_name}</h2>
            <p className="text-xs text-teal-200 font-semibold">
              Vai trò:{' '}
              {profile.role === 'admin'
                ? 'Quản trị viên (Toàn quyền)'
                : profile.role === 'inspector'
                ? 'Nhân viên Kiểm tra ATSH'
                : 'Người xem (Chỉ đọc)'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/35 border border-white/75 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setSubTab('customizer')}
              className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition ${
                subTab === 'customizer' ? 'btn-accent' : 'text-white/85 hover:bg-white/40'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Tùy biến giao diện</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('system')}
              className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition ${
                subTab === 'system' ? 'btn-accent' : 'text-white/85 hover:bg-white/40'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Thông số nghiệp vụ</span>
            </button>
          </div>

          <PWAInstallButton />
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[48px] px-4 rounded-2xl bg-rose-500/80 hover:bg-rose-500 border border-rose-300/40 text-white text-xs sm:text-sm font-bold flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>

      {/* Supabase Cloud Synchronization & SQL RLS Quick Card */}
      <div className="glass-card density-pad flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Database className="w-5 h-5 text-teal-300" />
            <span>Đồng Bộ Cơ Sở Dữ Liệu Đám Mây Supabase & Policy RLS</span>
          </div>
          <p className="text-xs text-white/80">
            Toàn bộ điểm rửa xe, hạng mục checklist, trạng thái và đường dẫn ảnh được đọc/ghi trực tiếp trên các bảng Supabase để đồng bộ trên mọi thiết bị.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onSyncLegacyData && (
            <button
              type="button"
              onClick={onSyncLegacyData}
              disabled={isSyncingLegacy}
              className="min-h-[46px] px-4 rounded-2xl btn-accent text-xs sm:text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <CloudUpload className="w-4 h-4" />
              <span>
                {isSyncingLegacy
                  ? 'Đang đẩy dữ liệu...'
                  : 'Đồng bộ dữ liệu cũ lên Supabase'}
              </span>
            </button>
          )}
          {onOpenSqlModal && (
            <button
              type="button"
              onClick={onOpenSqlModal}
              className="min-h-[46px] px-4 rounded-2xl glass-tool text-xs sm:text-sm font-bold flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              <span>SQL Tạo Bảng & Policy RLS</span>
            </button>
          )}
        </div>
      </div>

      {subTab === 'customizer' ? (
        <UICustomizerPanel
          deviceType={deviceType}
          prefs={uiPrefs}
          sites={sites}
          onUpdatePrefs={onUpdateUIPrefs}
          onResetDefault={onResetUIPrefs}
          onApplyPreset={onApplyPreset}
          onExportCSV={onExportUICSV}
          onImportCSV={onImportUICSV}
          onShowToast={onShowToast}
        />
      ) : (
        <div className="space-y-4">
          {/* Site Management Trigger */}
          <div className="glass-card density-pad flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-base font-bold text-white">
                <Building2 className="w-5 h-5 text-teal-300" />
                <span>Quản Lý Danh Sách Điểm Rửa Xe Sát Khuẩn</span>
              </div>
              <p className="text-xs text-white/80">
                Thêm điểm mới, cập nhật tọa độ GPS hiện trường, người phụ trách và chu kỳ kiểm tra.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenManageSites}
              className="min-h-[48px] px-5 rounded-2xl btn-accent text-xs sm:text-sm font-bold shrink-0"
            >
              Mở danh sách điểm rửa xe
            </button>
          </div>

          {/* Compliance Score Thresholds */}
          <div className="glass-card density-pad space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <Sliders className="w-5 h-5 text-teal-300" />
              <span>Ngưỡng Đánh Giá Điểm Tuân Thủ (%)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/90 mb-1.5">
                  Ngưỡng xếp loại TỐT - Xanh (Mặc định: 90%)
                </label>
                <input
                  type="number"
                  min={80}
                  max={100}
                  value={settings.thresholdGood}
                  onChange={(e) =>
                    onUpdateSettings({
                      thresholdGood: Math.min(100, Math.max(80, Number(e.target.value) || 90)),
                    })
                  }
                  className="w-full min-h-[48px] px-4 rounded-2xl glass-tool text-sm font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/90 mb-1.5">
                  Ngưỡng CẦN CẢI THIỆN - Vàng (Mặc định: 75%)
                </label>
                <input
                  type="number"
                  min={50}
                  max={89}
                  value={settings.thresholdWarning}
                  onChange={(e) =>
                    onUpdateSettings({
                      thresholdWarning: Math.min(89, Math.max(50, Number(e.target.value) || 75)),
                    })
                  }
                  className="w-full min-h-[48px] px-4 rounded-2xl glass-tool text-sm font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Default Chemical Contact Time */}
          <div className="glass-card density-pad space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <Timer className="w-5 h-5 text-teal-300" />
              <span>Thời Gian Tiếp Xúc Hóa Chất Mặc Định (Bước 4 Rửa Xe)</span>
            </div>
            <p className="text-xs text-white/80">
              Thời gian đếm ngược chờ hóa chất sát khuẩn phát huy tác dụng trước khi cho xe qua vùng SẠCH (khuyến nghị 15–30 phút).
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              {[15, 20, 25, 30].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => onUpdateSettings({ defaultContactMinutes: mins })}
                  className={`min-h-[48px] px-5 rounded-2xl font-mono text-sm font-bold transition ${
                    settings.defaultContactMinutes === mins
                      ? 'btn-accent'
                      : 'glass-tool'
                  }`}
                >
                  {mins} phút
                </button>
              ))}
            </div>
          </div>

          {/* Keyboard Shortcuts Reference for Laptop/Desktop */}
          <div className="glass-card density-pad space-y-3">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <Keyboard className="w-5 h-5 text-teal-300" />
              <span>Phím Tắt Nhanh Trên Laptop / Máy Bàn</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-white/90">
              <div className="p-3 rounded-2xl glass-tool flex items-center justify-between">
                <span>Mở Dashboard Tổng quan</span>
                <kbd className="px-2.5 py-1 rounded-lg bg-white/60 font-mono font-bold">G + D</kbd>
              </div>
              <div className="p-3 rounded-2xl glass-tool flex items-center justify-between">
                <span>Mở Lịch sử & Báo cáo</span>
                <kbd className="px-2.5 py-1 rounded-lg bg-white/60 font-mono font-bold">G + L</kbd>
              </div>
              <div className="p-3 rounded-2xl glass-tool flex items-center justify-between">
                <span>Tạo phiên Kiểm tra mới</span>
                <kbd className="px-2.5 py-1 rounded-lg bg-white/60 font-mono font-bold">N</kbd>
              </div>
              <div className="p-3 rounded-2xl glass-tool flex items-center justify-between">
                <span>Đặt con trỏ vào ô Tìm kiếm</span>
                <kbd className="px-2.5 py-1 rounded-lg bg-white/60 font-mono font-bold">/</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
