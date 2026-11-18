import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { clearOfflineQueue } from './lib/offlineQueue';
import { useAppData } from './hooks/useAppData';
import { useDevice } from './hooks/useDevice';
import { NavTabId, useUIPreferences } from './hooks/useUIPreferences';
import { AppSettings, Profile, Site } from './types/database';
import { GlassSkeleton, PWAInstallButton } from './components/CommonUI';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { InspectionView } from './components/InspectionView';
import { CorrectiveActionsView } from './components/CorrectiveActionsView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { SiteManagementModal } from './components/SiteManagementModal';
import { ItemManagerModal } from './components/ItemManagerModal';

const NAV_ICON_MAP: Record<NavTabId, React.FC<{ className?: string }>> = {
  overview: LayoutDashboard,
  inspect: ClipboardCheck,
  actions: AlertTriangle,
  history: History,
  settings: Settings,
};

export default function App() {
  const { deviceType, prefersReducedMotion } = useDevice();
  const {
    prefs: uiPrefs,
    updatePrefs: updateUIPrefs,
    resetToDefault: resetUIPrefs,
    applyPresetLayout,
    exportPrefsToCSV,
    importPrefsFromCSV,
  } = useUIPreferences(deviceType, prefersReducedMotion);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTabId>(uiPrefs.defaultTab || 'overview');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [historySiteFilter, setHistorySiteFilter] = useState<string | null>(null);

  // Modals
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [managingItemsSite, setManagingItemsSite] = useState<Site | null>(null);

  // Search Input Ref for '/' keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Business logic thresholds & contact time (in-memory)
  const [settings, setSettings] = useState<AppSettings>({
    thresholdGood: 90,
    thresholdWarning: 75,
    defaultContactMinutes: 20,
    theme: uiPrefs.themeMode === 'light' ? 'light' : 'dark',
  });

  const isAuthenticated = !!profile;
  const {
    isOnline,
    overview,
    sites,
    checklistItems,
    inspections,
    inspectionResults,
    correctiveActions,
    vehicleWashes,
    loading,
    error,
    toastMessage,
    pendingOfflineCount,
    showToast,
    refreshAll,
  } = useAppData(isAuthenticated);

  const handleLogout = useCallback(async (reason?: string) => {
    await supabase.auth.signOut().catch(() => {});
    await clearOfflineQueue();
    setProfile(null);
    if (reason) {
      setAuthNotice(reason);
    }
  }, []);

  // Laptop/Desktop Keyboard Shortcuts: G+D (Overview), G+L (History), N (New Inspection), / (Search)
  const lastKeyGRef = useRef<number>(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      const key = e.key.toLowerCase();
      const now = Date.now();

      if (key === 'g') {
        lastKeyGRef.current = now;
        return;
      }

      if (now - lastKeyGRef.current < 1000) {
        if (key === 'd') {
          e.preventDefault();
          setActiveTab('overview');
          lastKeyGRef.current = 0;
          return;
        }
        if (key === 'l') {
          e.preventDefault();
          setActiveTab('history');
          lastKeyGRef.current = 0;
          return;
        }
      }

      if (key === 'n') {
        e.preventDefault();
        setActiveTab('inspect');
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setActiveTab('overview');
        window.setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  // Mandatory Login Screen when not authenticated
  if (!profile) {
    return (
      <LoginScreen
        onLoginSuccess={(prof) => {
          setAuthNotice(null);
          setProfile(prof);
          setActiveTab(uiPrefs.defaultTab || 'overview');
        }}
        externalMessage={authNotice}
      />
    );
  }

  const openActionsCount = correctiveActions.filter((a) => a.status !== 'closed').length;
  const visibleNavItems = uiPrefs.navItems.filter((n) => n.visible).slice(0, 5);

  return (
    <div className="biowash-mesh-bg w-full relative overflow-x-hidden text-white">
      {/* Apple iOS / visionOS Ambient Silk Wallpaper Blobs (automatically hidden in power-saving mode) */}
      <div className="mesh-blob pointer-events-none fixed -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-white/55 blur-3xl animate-float-slow" />
      <div className="mesh-blob pointer-events-none fixed top-1/4 right-0 w-96 h-96 rounded-full bg-sky-300/45 blur-3xl animate-float-slow" />
      <div className="mesh-blob pointer-events-none fixed bottom-6 left-1/4 w-[26rem] h-[26rem] rounded-full bg-indigo-200/40 blur-3xl animate-float-slow" />

      {/* Realtime / Sync Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 md:bottom-6 right-4 z-50 glass-panel px-4 py-3 text-xs sm:text-sm font-bold text-white shadow-2xl border border-white/40 max-w-sm">
          {toastMessage}
        </div>
      )}

      {/* TOP NAVIGATION BAR (3-Zone Contract) */}
      <header className="sticky top-0 z-30 glass-panel rounded-none border-x-0 border-t-0 px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl btn-accent flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="font-bold text-sm sm:text-base tracking-tight whitespace-nowrap shrink-0">
            BIO-WASH CHECK
          </span>
        </div>

        {/* Zone 2: Live Connection Status & User Profile */}
        <div className="flex items-center gap-3 sm:gap-5 text-xs overflow-hidden">
          <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Wifi className="w-3.5 h-3.5 text-emerald-300 hidden sm:inline" />
                <span className="font-bold text-emerald-200">Trực tuyến</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <WifiOff className="w-3.5 h-3.5 text-amber-300" />
                <span className="font-bold text-amber-200">
                  Mất kết nối {pendingOfflineCount > 0 ? `(Chờ ĐB: ${pendingOfflineCount})` : ''}
                </span>
              </>
            )}
          </div>

          <span aria-hidden="true" className="text-white/40 hidden sm:inline">
            ·
          </span>

          <div className="hidden sm:flex items-center gap-1.5 truncate">
            <span className="font-bold truncate">{profile.full_name}</span>
            <span aria-hidden="true">·</span>
            <span className="text-sky-200 font-bold uppercase">{profile.role}</span>
          </div>
        </div>

        {/* Zone 3: Primary Action (Logout & PWA Install) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:block">
            <PWAInstallButton compact />
          </div>
          <button
            type="button"
            onClick={() => handleLogout()}
            className="min-h-[42px] px-3 sm:px-3.5 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-300/40 text-white text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>

      {/* ADAPTIVE WORKSPACE CONTAINER (max 1600px centered, 100dvh compliant) */}
      <div className="max-w-[1600px] mx-auto flex min-h-[calc(100dvh-3.5rem)]">
        {/* TABLET (640-1024px): Left Glass Icon Rail */}
        {deviceType === 'tablet' && (
          <aside className="w-20 shrink-0 p-2.5">
            <div className="glass-card p-2 space-y-2 sticky top-18 flex flex-col items-center">
              {visibleNavItems.map((item) => {
                const Icon = NAV_ICON_MAP[item.id];
                const isActive = activeTab === item.id;
                const badge =
                  item.id === 'actions' && openActionsCount > 0 ? openActionsCount : undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-14 min-h-[54px] rounded-2xl flex flex-col items-center justify-center relative transition ${
                      isActive
                        ? 'btn-accent'
                        : 'bg-white/15 border border-white/35 text-white/95 hover:bg-white/30'
                    }`}
                    title={item.label}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-bold mt-1 truncate max-w-[50px]">
                      {item.label}
                    </span>
                    {badge !== undefined && (
                      <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-mono font-bold px-1.5 rounded-full">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* LAPTOP / DESKTOP (>1024px): Collapsible Left Glass Sidebar */}
        {deviceType === 'desktop' && (
          <aside
            className={`shrink-0 p-4 transition-all duration-200 ${
              uiPrefs.sidebarCollapsed ? 'w-24' : 'w-64'
            }`}
          >
            <div className="glass-card p-3 space-y-2 sticky top-20">
              <div className="flex items-center justify-between px-1 pb-1 border-b border-white/15">
                {!uiPrefs.sidebarCollapsed && (
                  <span className="text-xs font-bold text-sky-200 uppercase tracking-wider">
                    Điều hướng
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    updateUIPrefs({ sidebarCollapsed: !uiPrefs.sidebarCollapsed })
                  }
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white ml-auto"
                  title={uiPrefs.sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
                >
                  {uiPrefs.sidebarCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronLeft className="w-4 h-4" />
                  )}
                </button>
              </div>

              {visibleNavItems.map((item) => {
                const Icon = NAV_ICON_MAP[item.id];
                const isActive = activeTab === item.id;
                const badge =
                  item.id === 'actions' && openActionsCount > 0 ? openActionsCount : undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full min-h-[48px] px-3.5 rounded-2xl text-sm font-bold flex items-center justify-between transition whitespace-nowrap shrink-0 relative ${
                      isActive
                        ? 'btn-accent'
                        : 'bg-white/15 border border-white/35 text-white/95 hover:bg-white/30'
                    }`}
                    title={item.label}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-5 h-5 shrink-0" />
                      {!uiPrefs.sidebarCollapsed && <span>{item.label}</span>}
                    </span>
                    {badge !== undefined && (
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                          uiPrefs.sidebarCollapsed
                            ? 'absolute -top-1 -right-1 bg-rose-500 text-white text-[10px]'
                            : 'bg-rose-500/80 text-white'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* MAIN VIEWPORT CONTENT */}
        <main
          className={`flex-1 p-3 sm:p-5 min-w-0 ${
            deviceType === 'mobile' ? 'pb-safe-dock' : 'pb-10'
          } ${uiPrefs.oneHandedMode && deviceType === 'mobile' ? 'pt-14' : ''}`}
        >
          {error && (
            <div className="mb-4 glass-card p-4 border border-rose-400/50 flex items-center justify-between gap-3 text-xs sm:text-sm text-rose-100">
              <span>{error}</span>
              <button
                type="button"
                onClick={refreshAll}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold shrink-0"
              >
                Thử lại
              </button>
            </div>
          )}

          {loading && sites.length === 0 ? (
            <GlassSkeleton count={6} />
          ) : (
            <>
              {activeTab === 'overview' && (
                <DashboardView
                  deviceType={deviceType}
                  uiPrefs={uiPrefs}
                  overview={overview}
                  sites={sites}
                  checklistItems={checklistItems}
                  inspections={inspections}
                  inspectionResults={inspectionResults}
                  correctiveActions={correctiveActions}
                  vehicleWashes={vehicleWashes}
                  settings={settings}
                  userRole={profile.role}
                  searchInputRef={searchInputRef}
                  onStartInspection={(sId) => {
                    setSelectedSiteId(sId);
                    setActiveTab('inspect');
                  }}
                  onNavigateTab={(tab, sId) => {
                    if (sId) setHistorySiteFilter(sId);
                    setActiveTab(tab);
                  }}
                  onOpenManageSites={() => setShowSiteModal(true)}
                  onOpenManageItems={(s) => setManagingItemsSite(s)}
                  onRefresh={refreshAll}
                  onShowToast={showToast}
                />
              )}

              {activeTab === 'inspect' && (
                <InspectionView
                  profile={profile}
                  sites={sites}
                  checklistItems={checklistItems}
                  selectedSiteId={selectedSiteId}
                  onSelectSiteId={setSelectedSiteId}
                  settings={settings}
                  onRefresh={refreshAll}
                  onShowToast={showToast}
                  onOpenManageItems={(s) => setManagingItemsSite(s)}
                  onOpenManageSites={() => setShowSiteModal(true)}
                />
              )}

              {activeTab === 'actions' && (
                <CorrectiveActionsView
                  actions={correctiveActions}
                  sites={sites}
                  userRole={profile.role}
                  onRefresh={refreshAll}
                  onShowToast={showToast}
                />
              )}

              {activeTab === 'history' && (
                <HistoryView
                  sites={sites}
                  inspections={inspections}
                  inspectionResults={inspectionResults}
                  correctiveActions={correctiveActions}
                  vehicleWashes={vehicleWashes}
                  initialSiteFilter={historySiteFilter}
                  userRole={profile.role}
                  onRefresh={refreshAll}
                  onShowToast={showToast}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  profile={profile}
                  deviceType={deviceType}
                  sites={sites}
                  settings={settings}
                  uiPrefs={uiPrefs}
                  onUpdateSettings={(patch) =>
                    setSettings((prev) => ({ ...prev, ...patch }))
                  }
                  onUpdateUIPrefs={updateUIPrefs}
                  onResetUIPrefs={resetUIPrefs}
                  onApplyPreset={applyPresetLayout}
                  onExportUICSV={exportPrefsToCSV}
                  onImportUICSV={importPrefsFromCSV}
                  onOpenManageSites={() => setShowSiteModal(true)}
                  onShowToast={showToast}
                  onLogout={() => handleLogout()}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* MOBILE (<640px) FLOATING GLASS DOCK (Safe-area aware, >=48px touch targets) */}
      {deviceType === 'mobile' && (
        <nav className="fixed left-3 right-3 dock-safe-bottom z-40 glass-panel px-2 py-1.5 shadow-2xl">
          <div
            className="grid items-center gap-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, visibleNavItems.length)}, minmax(0, 1fr))`,
            }}
          >
            {visibleNavItems.map((item) => {
              const Icon = NAV_ICON_MAP[item.id];
              const isActive = activeTab === item.id;
              const badge =
                item.id === 'actions' && openActionsCount > 0 ? openActionsCount : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[50px] flex flex-col items-center justify-center rounded-2xl relative transition ${
                    isActive
                      ? 'btn-accent font-bold'
                      : 'bg-white/15 border border-white/30 text-white/95 hover:bg-white/30 font-semibold'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px] mt-0.5 whitespace-nowrap truncate max-w-[64px]">
                    {item.label}
                  </span>
                  {badge !== undefined && (
                    <span className="absolute top-1 right-2.5 bg-rose-500 text-white text-[10px] font-mono font-bold px-1.5 rounded-full">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* SITE MANAGEMENT MODAL */}
      {showSiteModal && (
        <SiteManagementModal
          sites={sites}
          userRole={profile.role}
          onClose={() => setShowSiteModal(false)}
          onSaved={refreshAll}
          onManageItems={(s) => {
            setShowSiteModal(false);
            setManagingItemsSite(s);
          }}
        />
      )}

      {/* CHECKLIST ITEM MANAGEMENT MODAL */}
      {managingItemsSite && (
        <ItemManagerModal
          site={managingItemsSite}
          allSites={sites}
          items={checklistItems}
          userRole={profile.role}
          onClose={() => setManagingItemsSite(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}
