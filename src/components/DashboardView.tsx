import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FlaskConical,
  LayoutGrid,
  Map as MapIcon,
  Phone,
  Pin,
  Play,
  Plus,
  Search,
  ShieldAlert,
  Truck,
  X,
} from 'lucide-react';
import { DeviceType } from '../hooks/useDevice';
import {
  DashboardWidgetConfig,
  UIPreferences,
  WidgetSize,
} from '../hooks/useUIPreferences';
import { repository } from '../lib/repository';
import {
  AppSettings,
  ChecklistItem,
  CorrectiveAction,
  Inspection,
  InspectionResultRow,
  SEVERITY_LABELS,
  Site,
  SiteOverview,
  SiteType,
  SITE_TYPE_LABELS,
  UserRole,
  VehicleWash,
} from '../types/database';
import { AnimatedCounter, CircularGauge } from './CommonUI';
import { LeafletSitesMap, SiteDetailView } from './SiteMapAndDetail';

interface DashboardViewProps {
  deviceType: DeviceType;
  uiPrefs: UIPreferences;
  overview: SiteOverview[];
  sites: Site[];
  checklistItems: ChecklistItem[];
  inspections: Inspection[];
  inspectionResults: InspectionResultRow[];
  correctiveActions: CorrectiveAction[];
  vehicleWashes: VehicleWash[];
  settings: AppSettings;
  userRole: UserRole;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onStartInspection: (siteId: string) => void;
  onNavigateTab: (
    tab: 'overview' | 'inspect' | 'actions' | 'history' | 'settings',
    siteId?: string
  ) => void;
  onOpenManageSites: () => void;
  onOpenManageItems: (site: Site) => void;
  onRefresh: () => void;
  onShowToast: (msg: string) => void;
}

type PeriodFilter = 'today' | '7d' | '30d' | 'quarter' | 'custom';

const CHART_COLORS = ['#2dd4bf', '#38bdf8', '#fbbf24', '#fb7185', '#a78bfa', '#34d399'];

function getDesktopColSpan(size: WidgetSize, deviceType: DeviceType): string {
  if (deviceType === 'mobile') return 'col-span-12';
  if (deviceType === 'tablet') {
    return size === 'full' || size === 'large' ? 'col-span-12' : 'col-span-6';
  }
  switch (size) {
    case 'small':
      return 'col-span-12 lg:col-span-4';
    case 'medium':
      return 'col-span-12 lg:col-span-6';
    case 'large':
      return 'col-span-12 lg:col-span-8';
    case 'full':
    default:
      return 'col-span-12';
  }
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  deviceType,
  uiPrefs,
  overview,
  sites,
  checklistItems,
  inspections,
  inspectionResults,
  correctiveActions,
  vehicleWashes,
  settings,
  userRole,
  searchInputRef,
  onStartInspection,
  onNavigateTab,
  onOpenManageSites,
  onOpenManageItems,
  onRefresh,
  onShowToast,
}) => {
  const activeSites = useMemo(() => sites.filter((s) => s.is_active), [sites]);

  // Sticky Filters
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | SiteType>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [quickSearch, setQuickSearch] = useState<string>('');

  // View Modes & Sorting for Sites
  const [siteViewMode, setSiteViewMode] = useState<'grid' | 'map'>('grid');
  const [siteSort, setSiteSort] = useState<'worst' | 'name' | 'recent'>('worst');
  const [comparisonMode, setComparisonMode] = useState<'compliance' | 'items' | 'activity'>(
    'compliance'
  );

  // Selected site for detail view (Full view on mobile/tablet, Right side panel on Desktop >1024px)
  const [detailSite, setDetailSite] = useState<Site | null>(null);
  const [kpiDrilldown, setKpiDrilldown] = useState<
    null | 'inspections' | 'compliance' | 'vehicles' | 'actions' | 'overdue_sites' | 'expiring_chem'
  >(null);

  // Compute time boundaries
  const { startMs, prevStartMs, prevEndMs } = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    if (period === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const s = startOfToday.getTime();
      return { startMs: s, prevStartMs: s - dayMs, prevEndMs: s };
    }
    if (period === '7d') {
      return { startMs: now - 7 * dayMs, prevStartMs: now - 14 * dayMs, prevEndMs: now - 7 * dayMs };
    }
    if (period === 'quarter') {
      return { startMs: now - 90 * dayMs, prevStartMs: now - 180 * dayMs, prevEndMs: now - 90 * dayMs };
    }
    if (period === 'custom' && customFrom) {
      const s = new Date(customFrom).getTime();
      const e = customTo ? new Date(customTo).getTime() + dayMs : now;
      const span = Math.max(dayMs, e - s);
      return { startMs: s, prevStartMs: s - span, prevEndMs: s };
    }
    return { startMs: now - 30 * dayMs, prevStartMs: now - 60 * dayMs, prevEndMs: now - 30 * dayMs };
  }, [period, customFrom, customTo]);

  // Filtered Sites
  const filteredSites = useMemo(() => {
    return activeSites.filter((s) => {
      if (typeFilter !== 'all' && s.site_type !== typeFilter) return false;
      if (siteFilter !== 'all' && s.id !== siteFilter) return false;
      if (quickSearch.trim()) {
        const q = quickSearch.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchAddr = (s.address || '').toLowerCase().includes(q);
        const matchMgr = (s.manager_name || '').toLowerCase().includes(q);
        if (!matchName && !matchAddr && !matchMgr) return false;
      }
      return true;
    });
  }, [activeSites, typeFilter, siteFilter, quickSearch]);

  const filteredSiteIds = useMemo(() => new Set(filteredSites.map((s) => s.id)), [filteredSites]);

  const overviewMap = useMemo(() => {
    const m = new Map<string, SiteOverview>();
    overview.forEach((o) => m.set(o.site_id, o));
    return m;
  }, [overview]);

  // Filtered Inspections (Current & Previous Period)
  const currentInspections = useMemo(() => {
    return inspections.filter((ins) => {
      if (!filteredSiteIds.has(ins.site_id)) return false;
      const t = new Date(ins.started_at).getTime();
      return t >= startMs;
    });
  }, [inspections, filteredSiteIds, startMs]);

  const prevInspections = useMemo(() => {
    return inspections.filter((ins) => {
      if (!filteredSiteIds.has(ins.site_id)) return false;
      const t = new Date(ins.started_at).getTime();
      return t >= prevStartMs && t < prevEndMs;
    });
  }, [inspections, filteredSiteIds, prevStartMs, prevEndMs]);

  // Filtered Vehicle Washes
  const currentWashes = useMemo(() => {
    return vehicleWashes.filter((w) => {
      if (!filteredSiteIds.has(w.site_id)) return false;
      const t = new Date(w.started_at).getTime();
      return t >= startMs;
    });
  }, [vehicleWashes, filteredSiteIds, startMs]);

  // Filtered Corrective Actions
  const filteredActions = useMemo(() => {
    return correctiveActions.filter((a) => filteredSiteIds.has(a.site_id));
  }, [correctiveActions, filteredSiteIds]);

  const openActions = useMemo(
    () => filteredActions.filter((a) => a.status !== 'closed'),
    [filteredActions]
  );

  // KPI Calculations
  const kpiStats = useMemo(() => {
    const totalInsp = currentInspections.length;
    const prevInspCount = prevInspections.length;
    const inspDeltaPct =
      prevInspCount > 0
        ? Math.round(((totalInsp - prevInspCount) / prevInspCount) * 100)
        : totalInsp > 0
        ? 100
        : 0;

    const scoredInsp = currentInspections.filter((i) => i.score !== null);
    let avgCompliance = 100;
    if (scoredInsp.length > 0) {
      avgCompliance =
        scoredInsp.reduce((acc, i) => acc + (i.score || 0), 0) / scoredInsp.length;
    } else {
      const ovScored = filteredSites
        .map((s) => overviewMap.get(s.id)?.compliance_pct)
        .filter((v): v is number => v !== null && v !== undefined);
      if (ovScored.length > 0) {
        avgCompliance = ovScored.reduce((a, b) => a + b, 0) / ovScored.length;
      }
    }

    const passWashes = currentWashes.filter((w) => w.result === 'dat').length;
    const failWashes = currentWashes.filter((w) => w.result === 'khong_dat').length;
    const firstPassRate =
      currentWashes.length > 0 ? Math.round((passWashes / currentWashes.length) * 100) : 100;

    const highRiskCount = openActions.filter((a) => a.severity === 'nguy_co_cao').length;
    const criticalCount = openActions.filter((a) => a.severity === 'nghiem_trong').length;
    const minorCount = openActions.filter((a) => !a.severity || a.severity === 'nhe').length;
    const now = Date.now();
    const overdueActionList = openActions.filter(
      (a) => a.due_date && new Date(a.due_date).getTime() + 86400000 < now
    );

    const overdueSites = filteredSites.filter((s) => {
      const ov = overviewMap.get(s.id);
      const lastDate = ov?.last_checked_at;
      if (!lastDate) return true;
      const daysSince = (now - new Date(lastDate).getTime()) / 86400000;
      return daysSince > (s.inspect_cycle_days || 7);
    });

    const expiringChemSites = filteredSites.filter((s) => {
      const latestSiteInsp = inspections.find(
        (i) => i.site_id === s.id && i.gps?.chemical_info?.expiry_date
      );
      if (latestSiteInsp?.gps?.chemical_info?.expiry_date) {
        const daysLeft =
          (new Date(latestSiteInsp.gps.chemical_info.expiry_date).getTime() - now) / 86400000;
        if (daysLeft <= 2) return true;
      }
      const chemFail = checklistItems.some(
        (it) =>
          it.site_id === s.id &&
          it.group_name.includes('Hóa chất') &&
          it.current_status === 'fail'
      );
      return chemFail;
    });

    return {
      totalInsp,
      inspDeltaPct,
      avgCompliance,
      totalWashes: currentWashes.length,
      passWashes,
      failWashes,
      firstPassRate,
      openActionsCount: openActions.length,
      highRiskCount,
      criticalCount,
      minorCount,
      overdueActionList,
      overdueSites,
      expiringChemSites,
    };
  }, [
    currentInspections,
    prevInspections,
    filteredSites,
    overviewMap,
    currentWashes,
    openActions,
    inspections,
    checklistItems,
  ]);

  // "CẦN XỬ LÝ NGAY" Priority Queue (Max 5 items)
  const urgentItems = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'action' | 'overdue_site';
      site: Site;
      title: string;
      badge: string;
      assignee: string;
      phone: string | null;
      actionObj?: CorrectiveAction;
    }> = [];

    const siteLookup = new Map<string, Site>();
    sites.forEach((s) => siteLookup.set(s.id, s));

    const sortedOpen = [...openActions].sort((a, b) => {
      const rank = (sev: string | null) =>
        sev === 'nguy_co_cao' ? 3 : sev === 'nghiem_trong' ? 2 : 1;
      return rank(b.severity) - rank(a.severity);
    });

    const now = Date.now();
    for (const act of sortedOpen) {
      if (list.length >= 5) break;
      const s = siteLookup.get(act.site_id);
      if (!s) continue;
      const isLate = act.due_date && new Date(act.due_date).getTime() + 86400000 < now;
      const daysLate = isLate
        ? Math.max(1, Math.floor((now - new Date(act.due_date!).getTime()) / 86400000))
        : 0;

      if (isLate || act.severity === 'nguy_co_cao' || act.severity === 'nghiem_trong') {
        list.push({
          id: `act_${act.id}`,
          type: 'action',
          site: s,
          title: act.description,
          badge: isLate
            ? `Quá hạn ${daysLate} ngày`
            : SEVERITY_LABELS[act.severity || 'nghiem_trong'],
          assignee: act.assignee || s.manager_name || 'Chưa phân công',
          phone: s.manager_phone,
          actionObj: act,
        });
      }
    }

    for (const s of kpiStats.overdueSites) {
      if (list.length >= 5) break;
      const ov = overviewMap.get(s.id);
      const daysSince = ov?.last_checked_at
        ? Math.floor((now - new Date(ov.last_checked_at).getTime()) / 86400000)
        : null;
      list.push({
        id: `site_${s.id}`,
        type: 'overdue_site',
        site: s,
        title: daysSince
          ? `Quá hạn kiểm tra định kỳ (${daysSince}/${s.inspect_cycle_days} ngày)`
          : `Chưa thực hiện kiểm tra lần đầu (chu kỳ ${s.inspect_cycle_days} ngày)`,
        badge: 'Quá hạn KT',
        assignee: s.manager_name || 'Quản lý trạm',
        phone: s.manager_phone,
      });
    }

    return list.slice(0, 5);
  }, [openActions, kpiStats.overdueSites, sites, overviewMap]);

  // Sorted Sites
  const sortedSites = useMemo(() => {
    const arr = [...filteredSites];
    arr.sort((a, b) => {
      const ovA = overviewMap.get(a.id);
      const ovB = overviewMap.get(b.id);
      if (siteSort === 'name') {
        return a.name.localeCompare(b.name, 'vi');
      }
      if (siteSort === 'recent') {
        const tA = ovA?.last_checked_at ? new Date(ovA.last_checked_at).getTime() : 0;
        const tB = ovB?.last_checked_at ? new Date(ovB.last_checked_at).getTime() : 0;
        return tB - tA;
      }
      const pctA = ovA?.compliance_pct ?? 100;
      const pctB = ovB?.compliance_pct ?? 100;
      return pctA - pctB;
    });
    return arr;
  }, [filteredSites, overviewMap, siteSort]);

  // --- ANALYTICS CHARTS DATA ---
  const trendData = useMemo(() => {
    const byDate = new Map<string, { total: number; count: number }>();
    const completed = currentInspections
      .filter((i) => i.score !== null)
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    completed.forEach((i) => {
      const d = new Date(i.started_at).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
      });
      const cur = byDate.get(d) || { total: 0, count: 0 };
      cur.total += i.score || 0;
      cur.count += 1;
      byDate.set(d, cur);
    });

    if (byDate.size === 0) {
      return [
        { date: 'T-3', score: Math.round(kpiStats.avgCompliance) },
        { date: 'Hôm nay', score: Math.round(kpiStats.avgCompliance) },
      ];
    }

    return Array.from(byDate.entries()).map(([date, val]) => ({
      date,
      score: Math.round(val.total / val.count),
    }));
  }, [currentInspections, kpiStats.avgCompliance]);

  const siteRankingData = useMemo(() => {
    return sortedSites.map((s) => ({
      name: s.name.length > 16 ? s.name.slice(0, 16) + '…' : s.name,
      score: Math.round(overviewMap.get(s.id)?.compliance_pct ?? 100),
    }));
  }, [sortedSites, overviewMap]);

  // Comprehensive Multi-Site Comparison Data for Dashboard Overview
  const siteComparisonData = useMemo(() => {
    return filteredSites.map((s) => {
      const ov = overviewMap.get(s.id);
      const siteInspections = currentInspections.filter((i) => i.site_id === s.id);
      const siteWashes = currentWashes.filter((w) => w.site_id === s.id);
      const siteItems = checklistItems.filter((it) => it.site_id === s.id && it.is_active);
      const passCount =
        ov?.pass_items ?? siteItems.filter((it) => it.current_status === 'pass').length;
      const failCount =
        ov?.fail_items ?? siteItems.filter((it) => it.current_status === 'fail').length;
      const openActCount =
        ov?.open_actions ??
        openActions.filter((a) => a.site_id === s.id && a.status !== 'closed').length;
      const compliance = Math.round(ov?.compliance_pct ?? 100);

      return {
        siteId: s.id,
        siteObj: s,
        name: s.name.length > 15 ? s.name.slice(0, 15) + '…' : s.name,
        fullName: s.name,
        siteTypeLabel: SITE_TYPE_LABELS[s.site_type],
        compliance,
        thresholdGood: settings.thresholdGood,
        passItems: passCount,
        failItems: failCount,
        openActions: openActCount,
        inspectionsCount: siteInspections.length,
        washesPass: siteWashes.filter((w) => w.result === 'dat').length,
        washesFail: siteWashes.filter((w) => w.result === 'khong_dat').length,
      };
    });
  }, [
    filteredSites,
    overviewMap,
    currentInspections,
    currentWashes,
    checklistItems,
    openActions,
    settings.thresholdGood,
  ]);

  const { topViolatedItems, groupErrorPieData } = useMemo(() => {
    const itemFailCounts = new Map<string, number>();
    const groupFailCounts = new Map<string, number>();

    const relevantResults = inspectionResults.filter(
      (r) => filteredSiteIds.has(r.site_id) && r.status === 'fail'
    );

    relevantResults.forEach((r) => {
      itemFailCounts.set(r.item_title, (itemFailCounts.get(r.item_title) || 0) + 1);
      const shortGrp = r.group_name.replace(/^\d+\)\s*/, '');
      groupFailCounts.set(shortGrp, (groupFailCounts.get(shortGrp) || 0) + 1);
    });

    if (relevantResults.length === 0) {
      checklistItems
        .filter((it) => filteredSiteIds.has(it.site_id) && it.current_status === 'fail')
        .forEach((it) => {
          itemFailCounts.set(it.title, (itemFailCounts.get(it.title) || 0) + 1);
          const shortGrp = it.group_name.replace(/^\d+\)\s*/, '');
          groupFailCounts.set(shortGrp, (groupFailCounts.get(shortGrp) || 0) + 1);
        });
    }

    const top10 = Array.from(itemFailCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([title, count]) => ({
        title: title.length > 26 ? title.slice(0, 26) + '…' : title,
        count,
      }));

    const pie = Array.from(groupFailCounts.entries()).map(([name, value]) => ({
      name,
      value,
    }));

    return { topViolatedItems: top10, groupErrorPieData: pie };
  }, [inspectionResults, checklistItems, filteredSiteIds]);

  const vehicleByTypeData = useMemo(() => {
    const types = ['Xe cám', 'Xe gà', 'Xe heo', 'Xe vật tư', 'Xe ngoài'];
    return types.map((t) => {
      const matches = currentWashes.filter((w) => w.vehicle_type === t);
      return {
        type: t,
        dat: matches.filter((w) => w.result === 'dat').length,
        khongDat: matches.filter((w) => w.result === 'khong_dat').length,
      };
    });
  }, [currentWashes]);

  const heatmapMatrix = useMemo(() => {
    const now = Date.now();
    const weekLabels = ['Tuần -3', 'Tuần -2', 'Tuần -1', 'Tuần này'];
    return filteredSites.slice(0, 8).map((s) => {
      const siteIns = inspections.filter((i) => i.site_id === s.id && i.score !== null);
      const weeks = [3, 2, 1, 0].map((wOffset) => {
        const wStart = now - (wOffset + 1) * 7 * 86400000;
        const wEnd = now - wOffset * 7 * 86400000;
        const inWeek = siteIns.filter((i) => {
          const t = new Date(i.started_at).getTime();
          return t >= wStart && t <= wEnd;
        });
        if (inWeek.length === 0) {
          return wOffset === 0 ? overviewMap.get(s.id)?.compliance_pct ?? null : null;
        }
        return Math.round(
          inWeek.reduce((acc, x) => acc + (x.score || 0), 0) / inWeek.length
        );
      });
      return { site: s, weeks, weekLabels };
    });
  }, [filteredSites, inspections, overviewMap]);

  const resolutionMetrics = useMemo(() => {
    const closed = filteredActions.filter((a) => a.status === 'closed' && a.closed_at);
    if (closed.length === 0) {
      return { avgHours: 18, onTimePct: 100, closedCount: 0 };
    }
    let totalHours = 0;
    let onTimeCount = 0;
    closed.forEach((a) => {
      const created = new Date(a.created_at).getTime();
      const closedAt = new Date(a.closed_at!).getTime();
      totalHours += Math.max(1, (closedAt - created) / 3600000);
      if (!a.due_date || closedAt <= new Date(a.due_date).getTime() + 86400000) {
        onTimeCount++;
      }
    });
    return {
      avgHours: Math.round(totalHours / closed.length),
      onTimePct: Math.round((onTimeCount / closed.length) * 100),
      closedCount: closed.length,
    };
  }, [filteredActions]);

  // On Mobile & Tablet, clicking a site opens the full SiteDetailView
  if (detailSite && deviceType !== 'desktop') {
    return (
      <SiteDetailView
        site={detailSite}
        overview={overviewMap.get(detailSite.id)}
        checklistItems={checklistItems}
        inspections={inspections}
        inspectionResults={inspectionResults}
        correctiveActions={correctiveActions}
        vehicleWashes={vehicleWashes}
        settings={settings}
        userRole={userRole}
        onBack={() => setDetailSite(null)}
        onStartInspection={(sId) => {
          setDetailSite(null);
          onStartInspection(sId);
        }}
        onViewHistory={(sId) => {
          setDetailSite(null);
          onNavigateTab('history', sId);
        }}
        onManageItems={(s) => onOpenManageItems(s)}
        onShowToast={onShowToast}
      />
    );
  }

  // Empty State when no sites exist
  if (activeSites.length === 0) {
    return (
      <div className="glass-card density-pad text-center space-y-4 py-10">
        <ShieldAlert className="w-14 h-14 text-teal-300 mx-auto" />
        <h2 className="fluid-title font-bold text-white">
          Chào mừng đến với BIO-WASH CHECK
        </h2>
        <p className="text-sm text-white/80 max-w-md mx-auto">
          Hệ thống chưa có điểm rửa xe sát khuẩn nào. Hãy thêm điểm rửa xe đầu tiên để bắt đầu giám sát An Toàn Sinh Học thời gian thực.
        </p>
        <button
          type="button"
          onClick={onOpenManageSites}
          className="min-h-[52px] px-6 rounded-2xl btn-accent font-bold text-sm inline-flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          <span>Thêm điểm rửa xe đầu tiên</span>
        </button>
      </div>
    );
  }

  // Render individual customizable Dashboard Widget
  const renderWidget = (wConfig: DashboardWidgetConfig) => {
    if (!wConfig.visible) return null;
    const spanClass = getDesktopColSpan(wConfig.size, deviceType);

    switch (wConfig.id) {
      case 'pinned_shortcuts': {
        const pinnedSites = activeSites.filter((s) =>
          uiPrefs.pinnedSiteIds.includes(s.id)
        );
        if (pinnedSites.length === 0) return null;
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-2.5">
              <div className="flex items-center justify-between text-xs text-teal-200 font-bold">
                <span className="flex items-center gap-1.5">
                  <Pin className="w-4 h-4" />
                  Lối tắt kiểm tra nhanh điểm đã ghim
                </span>
                <span>{pinnedSites.length}/4 điểm</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {pinnedSites.map((ps) => (
                  <button
                    key={ps.id}
                    type="button"
                    onClick={() => onStartInspection(ps.id)}
                    className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 text-left flex items-center justify-between gap-2 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white truncate">
                        {ps.name}
                      </div>
                      <div className="text-[11px] text-white/75">
                        {SITE_TYPE_LABELS[ps.site_type]}
                      </div>
                    </div>
                    <ClipboardCheck className="w-4 h-4 text-teal-300 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'kpi_strip': {
        // Adaptive KPI Layout:
        // - Mobile (<640px): Horizontal snap carousel
        // - Tablet (640-1024px): 3x2 grid
        // - Desktop (>1024px): 1 row of 6 columns
        const containerClass =
          deviceType === 'mobile'
            ? 'flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-1 px-1'
            : deviceType === 'tablet'
            ? 'grid grid-cols-3 gap-3.5'
            : 'grid grid-cols-6 gap-3.5';

        const cardMinWidth =
          deviceType === 'mobile' ? 'min-w-[265px] snap-center shrink-0' : 'min-w-0';

        return (
          <div key={wConfig.id} className={spanClass}>
            <div className={containerClass}>
              {/* KPI 1 */}
              <button
                type="button"
                onClick={() => setKpiDrilldown('inspections')}
                className={`glass-card density-pad text-left hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-3 ${cardMinWidth}`}
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-xs font-semibold text-white/80 block truncate">
                    1. Lượt kiểm tra
                  </span>
                  <div className="fluid-kpi font-bold font-mono text-white">
                    <AnimatedCounter value={kpiStats.totalInsp} />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold">
                    {kpiStats.inspDeltaPct >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                    )}
                    <span
                      className={
                        kpiStats.inspDeltaPct >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }
                    >
                      {kpiStats.inspDeltaPct >= 0
                        ? `+${kpiStats.inspDeltaPct}%`
                        : `${kpiStats.inspDeltaPct}%`}
                    </span>
                    <span className="text-white/70 truncate">kỳ trước</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-teal-300 shrink-0">
                  <ClipboardList className="w-5 h-5" />
                </div>
              </button>

              {/* KPI 2 */}
              <button
                type="button"
                onClick={() => setKpiDrilldown('compliance')}
                className={`glass-card density-pad text-left hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-2 ${cardMinWidth}`}
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-xs font-semibold text-white/80 block truncate">
                    2. Tuân thủ TB
                  </span>
                  <div className="fluid-kpi font-bold font-mono text-white">
                    <AnimatedCounter value={kpiStats.avgCompliance} decimals={1} suffix="%" />
                  </div>
                  <span className="text-[11px] text-white/75 block truncate">
                    Chuẩn ≥{settings.thresholdGood}%
                  </span>
                </div>
                <CircularGauge
                  percentage={kpiStats.avgCompliance}
                  size={56}
                  strokeWidth={6}
                  thresholdGood={settings.thresholdGood}
                  thresholdWarn={settings.thresholdWarning}
                />
              </button>

              {/* KPI 3 */}
              <button
                type="button"
                onClick={() => setKpiDrilldown('vehicles')}
                className={`glass-card density-pad text-left hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-3 ${cardMinWidth}`}
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-xs font-semibold text-white/80 block truncate">
                    3. Xe đã xử lý
                  </span>
                  <div className="fluid-kpi font-bold font-mono text-white">
                    <AnimatedCounter value={kpiStats.totalWashes} />
                  </div>
                  <p className="text-[11px] text-white/80 truncate">
                    Đạt: <strong className="text-emerald-300">{kpiStats.passWashes}</strong> · Lần
                    đầu: <strong>{kpiStats.firstPassRate}%</strong>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-cyan-300 shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
              </button>

              {/* KPI 4 */}
              <button
                type="button"
                onClick={() => onNavigateTab('actions')}
                className={`glass-card density-pad text-left hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-3 ${cardMinWidth} ${
                  kpiStats.overdueActionList.length > 0 ? 'glow-fail' : ''
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white/80 truncate">
                      4. Lỗi đang mở
                    </span>
                    {kpiStats.overdueActionList.length > 0 && (
                      <span className="text-[10px] font-bold text-rose-300 animate-pulse-soft shrink-0">
                        {kpiStats.overdueActionList.length} trễ!
                      </span>
                    )}
                  </div>
                  <div className="fluid-kpi font-bold font-mono text-rose-300">
                    <AnimatedCounter value={kpiStats.openActionsCount} />
                  </div>
                  <p className="text-[11px] text-white/80 truncate">
                    Cao: <strong>{kpiStats.highRiskCount}</strong> · N.Trọng:{' '}
                    <strong>{kpiStats.criticalCount}</strong>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-rose-500/25 flex items-center justify-center text-rose-300 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </button>

              {/* KPI 5 */}
              <button
                type="button"
                onClick={() => setKpiDrilldown('overdue_sites')}
                className={`glass-card density-pad text-left hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-3 ${cardMinWidth}`}
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-xs font-semibold text-white/80 block truncate">
                    5. Điểm quá hạn KT
                  </span>
                  <div className="fluid-kpi font-bold font-mono text-amber-300">
                    <AnimatedCounter value={kpiStats.overdueSites.length} />
                  </div>
                  <span className="text-[11px] text-white/75 block truncate">
                    Theo chu kỳ từng điểm
                  </span>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-500/25 flex items-center justify-center text-amber-300 shrink-0">
                  <CalendarClock className="w-5 h-5" />
                </div>
              </button>

              {/* KPI 6 */}
              <button
                type="button"
                onClick={() => setKpiDrilldown('expiring_chem')}
                className={`glass-card density-pad text-left hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between gap-3 ${cardMinWidth}`}
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-xs font-semibold text-white/80 block truncate">
                    6. Dung dịch hết hạn
                  </span>
                  <div className="fluid-kpi font-bold font-mono text-sky-100">
                    <AnimatedCounter value={kpiStats.expiringChemSites.length} />
                  </div>
                  <span className="text-[11px] text-white/75 block truncate">
                    Cảnh báo thay hóa chất
                  </span>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white/25 border border-white/40 flex items-center justify-center text-white shrink-0">
                  <FlaskConical className="w-5 h-5" />
                </div>
              </button>
            </div>
          </div>
        );
      }

      case 'site_comparison': {
        const bestSite =
          siteComparisonData.length > 0
            ? [...siteComparisonData].sort((a, b) => b.compliance - a.compliance)[0]
            : null;
        const worstSite =
          siteComparisonData.length > 0
            ? [...siteComparisonData].sort((a, b) => a.compliance - b.compliance)[0]
            : null;
        const totalPassAll = siteComparisonData.reduce((acc, s) => acc + s.passItems, 0);
        const totalFailAll = siteComparisonData.reduce((acc, s) => acc + s.failItems, 0);

        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-white/25">
                <div>
                  <h3 className="fluid-title font-bold text-white flex items-center gap-2">
                    <span>Tổng Quan & Biểu Đồ So Sánh Giữa Các Điểm Rửa Xe</span>
                  </h3>
                  <p className="text-xs text-white/85">
                    Đối chiếu trực tiếp tỷ lệ tuân thủ, số hạng mục Đạt / Không đạt và tần suất kiểm tra - rửa xe giữa {siteComparisonData.length} điểm
                  </p>
                </div>

                {/* Translucent White Glass Mode Switcher Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-white/15 border border-white/40 backdrop-blur-md self-start">
                  <button
                    type="button"
                    onClick={() => setComparisonMode('compliance')}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      comparisonMode === 'compliance'
                        ? 'btn-accent'
                        : 'text-white/90 hover:bg-white/20'
                    }`}
                  >
                    Điểm tuân thủ (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setComparisonMode('items')}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      comparisonMode === 'items'
                        ? 'btn-accent'
                        : 'text-white/90 hover:bg-white/20'
                    }`}
                  >
                    Hạng mục Đạt / Lỗi
                  </button>
                  <button
                    type="button"
                    onClick={() => setComparisonMode('activity')}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      comparisonMode === 'activity'
                        ? 'btn-accent'
                        : 'text-white/90 hover:bg-white/20'
                    }`}
                  >
                    Lượt Kiểm tra & Rửa xe
                  </button>
                </div>
              </div>

              {/* Quick Overview Comparison Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-white/20 border border-white/45 backdrop-blur-md flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-white/85 block">
                      Điểm dẫn đầu tuân thủ
                    </span>
                    <p className="text-sm font-bold text-white truncate">
                      {bestSite ? bestSite.fullName : '—'}
                    </p>
                  </div>
                  <span className="font-mono text-base font-bold text-emerald-200 bg-emerald-500/30 border border-emerald-300/50 px-2.5 py-1 rounded-xl shrink-0">
                    {bestSite ? `${bestSite.compliance}%` : '—'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/20 border border-white/45 backdrop-blur-md flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-white/85 block">
                      Điểm cần chú ý nhất
                    </span>
                    <p className="text-sm font-bold text-white truncate">
                      {worstSite ? worstSite.fullName : '—'}
                    </p>
                  </div>
                  <span className="font-mono text-base font-bold text-amber-100 bg-amber-500/35 border border-amber-300/50 px-2.5 py-1 rounded-xl shrink-0">
                    {worstSite ? `${worstSite.compliance}%` : '—'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/20 border border-white/45 backdrop-blur-md flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-white/85 block">
                      Tổng hạng mục Đạt / Lỗi
                    </span>
                    <p className="text-sm font-bold text-white">
                      Đạt {totalPassAll} · Không đạt {totalFailAll}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-white bg-white/25 border border-white/50 px-2.5 py-1 rounded-xl shrink-0">
                    {siteComparisonData.length} điểm
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/20 border border-white/45 backdrop-blur-md flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-white/85 block">
                      Độ lệch chuẩn giữa các điểm
                    </span>
                    <p className="text-sm font-bold text-white">
                      {bestSite && worstSite
                        ? `Chênh lệch ${Math.max(0, bestSite.compliance - worstSite.compliance)}%`
                        : 'Đồng đều 100%'}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-white bg-sky-500/30 border border-white/50 px-2.5 py-1 rounded-xl shrink-0">
                    Chuẩn ≥{settings.thresholdGood}%
                  </span>
                </div>
              </div>

              {/* Interactive Multi-Site Comparison Chart */}
              <div className="h-72 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  {comparisonMode === 'compliance' ? (
                    <BarChart
                      data={siteComparisonData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.14)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 700 }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 700 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.94)',
                          backdropFilter: 'blur(16px)',
                          borderRadius: '16px',
                          border: '1.5px solid rgba(255,255,255,0.68)',
                          color: '#fff',
                          fontWeight: 600,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', color: '#0f172a', fontWeight: 700 }} />
                      <ReferenceLine
                        y={settings.thresholdGood}
                        stroke="#0284c7"
                        strokeDasharray="5 5"
                        label={{
                          value: `Chuẩn ${settings.thresholdGood}%`,
                          fill: '#0f172a',
                          fontSize: 11,
                          fontWeight: 700,
                          position: 'insideTopRight',
                        }}
                      />
                      <Bar
                        dataKey="compliance"
                        name="Điểm tuân thủ (%)"
                        radius={[10, 10, 0, 0]}
                        onClick={(_data, idx) => {
                          const item = siteComparisonData[idx];
                          if (item?.siteObj) setDetailSite(item.siteObj);
                        }}
                      >
                        {siteComparisonData.map((entry, idx) => (
                          <Cell
                            key={`cell-comp-${idx}`}
                            fill={
                              entry.compliance >= settings.thresholdGood
                                ? '#10b981'
                                : entry.compliance >= settings.thresholdWarning
                                ? '#f59e0b'
                                : '#f43f5e'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : comparisonMode === 'items' ? (
                    <BarChart
                      data={siteComparisonData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.14)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 700 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 700 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.94)',
                          backdropFilter: 'blur(16px)',
                          borderRadius: '16px',
                          border: '1.5px solid rgba(255,255,255,0.68)',
                          color: '#fff',
                          fontWeight: 600,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', color: '#0f172a', fontWeight: 700 }} />
                      <Bar
                        dataKey="passItems"
                        name="Hạng mục Đạt"
                        fill="#10b981"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="failItems"
                        name="Hạng mục Không đạt"
                        fill="#f43f5e"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="openActions"
                        name="Việc khắc phục đang mở"
                        fill="#f59e0b"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  ) : (
                    <BarChart
                      data={siteComparisonData}
                      margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.14)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 700 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 700 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.94)',
                          backdropFilter: 'blur(16px)',
                          borderRadius: '16px',
                          border: '1.5px solid rgba(255,255,255,0.68)',
                          color: '#fff',
                          fontWeight: 600,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', color: '#0f172a', fontWeight: 700 }} />
                      <Bar
                        dataKey="inspectionsCount"
                        name="Lượt kiểm tra"
                        fill="#0284c7"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="washesPass"
                        name="Xe rửa Đạt"
                        fill="#10b981"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="washesFail"
                        name="Xe rửa Không đạt"
                        fill="#f43f5e"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      }

      case 'urgent_actions':
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="fluid-title font-bold flex items-center gap-2 text-white">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <span>CẦN XỬ LÝ NGAY</span>
                </h3>
                <span className="text-xs text-white/75">
                  Tối đa 5 mục ưu tiên: Lỗi Nguy cơ cao/Nghiêm trọng · Lỗi quá hạn · Điểm quá hạn KT
                </span>
              </div>

              {urgentItems.length === 0 ? (
                <div className="rounded-2xl bg-emerald-500/20 border border-emerald-300/40 p-4 flex items-center justify-center gap-2 text-emerald-200 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Mọi điểm đang ổn ✅</span>
                </div>
              ) : (
                <div className="divide-y divide-white/15">
                  {urgentItems.map((u) => (
                    <div
                      key={u.id}
                      className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-teal-200">{u.site.name}</span>
                          <span>·</span>
                          <span className="font-bold text-rose-300">{u.badge}</span>
                          <span>·</span>
                          <span className="text-white/80">Phụ trách: {u.assignee}</span>
                        </div>
                        <p className="text-sm font-semibold text-white">{u.title}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDetailSite(u.site)}
                          className="min-h-[44px] px-3.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem</span>
                        </button>
                        {u.phone && (
                          <a
                            href={`tel:${u.phone}`}
                            className="min-h-[44px] px-3.5 rounded-xl bg-cyan-500/25 border border-cyan-300/40 text-cyan-100 text-xs font-bold flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Gọi</span>
                          </a>
                        )}
                        {u.type === 'action' &&
                        u.actionObj &&
                        (userRole === 'admin' || userRole === 'inspector') ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await repository.updateCorrectiveAction(u.actionObj!.id, {
                                status: 'in_progress',
                              });
                              onRefresh();
                              onShowToast('Đã chuyển lỗi sang trạng thái Đang xử lý');
                            }}
                            className="min-h-[44px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Đang xử lý</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onStartInspection(u.site.id)}
                            className="min-h-[44px] px-3.5 rounded-xl btn-accent text-xs font-bold"
                          >
                            Kiểm tra
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'sites_status':
        return (
          <div key={wConfig.id} className={`${spanClass} space-y-3`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="fluid-title font-bold text-white">
                Trạng Thái Các Điểm Rửa Xe Sát Khuẩn ({sortedSites.length})
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={siteSort}
                  onChange={(e) => setSiteSort(e.target.value as typeof siteSort)}
                  className="min-h-[44px] px-3.5 rounded-xl glass-tool text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-white/80"
                >
                  <option value="worst">Sắp xếp: Xấu nhất trước</option>
                  <option value="name">Sắp xếp: Theo tên A-Z</option>
                  <option value="recent">Sắp xếp: Kiểm tra gần nhất</option>
                </select>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/20 border border-white/50 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setSiteViewMode('grid')}
                    className={`min-h-[40px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                      siteViewMode === 'grid' ? 'btn-accent' : 'text-white/90 hover:bg-white/20'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Lưới thẻ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteViewMode('map')}
                    className={`min-h-[40px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                      siteViewMode === 'map' ? 'btn-accent' : 'text-white/90 hover:bg-white/20'
                    }`}
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    <span>Bản đồ</span>
                  </button>
                </div>
              </div>
            </div>

            {siteViewMode === 'map' ? (
              <LeafletSitesMap
                sites={sortedSites}
                overviewMap={overviewMap}
                settings={settings}
                onSelectSite={(s) => setDetailSite(s)}
              />
            ) : (
              <div
                className={`grid gap-4 ${
                  deviceType === 'mobile'
                    ? 'grid-cols-1'
                    : deviceType === 'tablet'
                    ? 'grid-cols-2'
                    : detailSite
                    ? 'grid-cols-2'
                    : 'grid-cols-3'
                }`}
              >
                {sortedSites.map((s) => {
                  const ov = overviewMap.get(s.id);
                  const pct = ov?.compliance_pct ?? 100;
                  const critFail = ov?.critical_fail ?? 0;
                  const isFail = critFail > 0 || pct < settings.thresholdWarning;
                  const isWarn = !isFail && pct < settings.thresholdGood;
                  const glowClass = isFail
                    ? 'glow-fail'
                    : isWarn
                    ? 'glow-warn'
                    : 'glow-pass';

                  const todayStr = new Date().toISOString().slice(0, 10);
                  const washesToday = vehicleWashes.filter(
                    (w) => w.site_id === s.id && w.started_at.slice(0, 10) === todayStr
                  ).length;

                  const siteCompleted = inspections
                    .filter((i) => i.site_id === s.id && i.score !== null)
                    .sort(
                      (a, b) =>
                        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
                    );
                  const trendUp =
                    siteCompleted.length < 2 ||
                    (siteCompleted[0].score || 0) >= (siteCompleted[1].score || 0);

                  return (
                    <div
                      key={s.id}
                      onClick={() => setDetailSite(s)}
                      className={`glass-card density-pad cursor-pointer hover:scale-[1.01] transition space-y-3 ${glowClass} ${
                        detailSite?.id === s.id ? 'ring-2 ring-white' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <span className="text-xs font-semibold text-teal-200 block">
                            {SITE_TYPE_LABELS[s.site_type]}
                          </span>
                          <h4 className="text-base font-bold leading-snug text-white truncate">
                            {s.name}
                          </h4>
                        </div>
                        <CircularGauge
                          percentage={pct}
                          size={58}
                          strokeWidth={6}
                          thresholdGood={settings.thresholdGood}
                          thresholdWarn={settings.thresholdWarning}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/85">
                        <span>
                          KT:{' '}
                          {ov?.last_checked_at
                            ? new Date(ov.last_checked_at).toLocaleDateString('vi-VN')
                            : 'Chưa KT'}
                        </span>
                        <span>·</span>
                        <span
                          className={
                            (ov?.open_actions || 0) > 0 ? 'text-rose-300 font-bold' : ''
                          }
                        >
                          Lỗi mở: {ov?.open_actions ?? 0}
                        </span>
                        <span>·</span>
                        <span>Xe hôm nay: {washesToday}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5 font-semibold">
                          {trendUp ? (
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5 text-rose-300" />
                          )}
                          {trendUp ? 'Ổn định' : 'Giảm'}
                        </span>
                      </div>

                      {userRole === 'admin' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-300/35">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenManageItems(s);
                            }}
                            className="flex-1 min-h-[36px] px-2.5 rounded-xl bg-white/45 hover:bg-white/75 border border-white/60 text-xs font-bold transition"
                          >
                            Sửa hạng mục
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenManageSites();
                            }}
                            className="flex-1 min-h-[36px] px-2.5 rounded-xl bg-white/45 hover:bg-white/75 border border-white/60 text-xs font-bold transition"
                          >
                            Sửa / Xóa điểm
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'chart_trend':
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-3 h-full">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  1. Xu Hướng Điểm Tuân Thủ (%)
                </h4>
                <p className="text-xs text-white/75">
                  Đường chuẩn xanh ({settings.thresholdGood}%) và ngưỡng cảnh báo (
                  {settings.thresholdWarning}%)
                </p>
              </div>
              <div className="h-60 w-full overflow-x-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.14)" />
                    <XAxis dataKey="date" tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,0.25)',
                        color: '#fff',
                      }}
                    />
                    <ReferenceLine
                      y={settings.thresholdGood}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                    />
                    <ReferenceLine
                      y={settings.thresholdWarning}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      name="Điểm tuân thủ (%)"
                      stroke="#0284c7"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#0284c7' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case 'chart_ranking':
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-3 h-full">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  2. Xếp Hạng Các Điểm Rửa Xe
                </h4>
                <p className="text-xs text-white/75">
                  So sánh tỷ lệ tuân thủ hiện tại giữa các điểm
                </p>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={siteRankingData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.14)" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={115}
                      tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,0.25)',
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="score" name="Điểm (%)" fill="#0284c7" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case 'chart_top_violations':
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-3 h-full">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  3. Top 10 Hạng Mục Hay Vi Phạm
                </h4>
                <p className="text-xs text-white/75">
                  Thống kê các hạng mục có số lần chấm Không đạt cao nhất
                </p>
              </div>
              {topViolatedItems.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-xs text-white/70">
                  Chưa ghi nhận hạng mục vi phạm nào trong kỳ.
                </div>
              ) : (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topViolatedItems} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.14)" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="title"
                        width={135}
                        tick={{ fill: '#0f172a', fontSize: 10, fontWeight: 600 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.92)',
                          borderRadius: '14px',
                          border: '1px solid rgba(255,255,255,0.25)',
                          color: '#fff',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Số lần lỗi"
                        fill="#f43f5e"
                        radius={[0, 8, 8, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        );

      case 'chart_group_donut':
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-3 h-full">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  4. Tỷ Trọng Lỗi Theo 6 Nhóm
                </h4>
                <p className="text-xs text-white/75">
                  Phân bổ vi phạm theo nhóm tiêu chuẩn An Toàn Sinh Học
                </p>
              </div>
              {groupErrorPieData.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-xs text-white/70">
                  Không có lỗi phát sinh theo nhóm.
                </div>
              ) : (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={groupErrorPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={3}
                      >
                        {groupErrorPieData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.92)',
                          borderRadius: '14px',
                          border: '1px solid rgba(255,255,255,0.25)',
                          color: '#fff',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', color: '#0f172a', fontWeight: 700 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        );

      case 'chart_vehicles':
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-3 h-full">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  5. Lượt Xe Theo Loại & Tỷ Lệ Đạt / Không Đạt
                </h4>
                <p className="text-xs text-white/75">
                  Thống kê phương tiện qua trạm rửa sát khuẩn
                </p>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vehicleByTypeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.14)" />
                    <XAxis dataKey="type" tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,0.25)',
                        color: '#fff',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#0f172a', fontWeight: 700 }} />
                    <Bar
                      dataKey="dat"
                      name="Đạt"
                      stackId="a"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="khongDat"
                      name="Không đạt"
                      stackId="a"
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case 'chart_heatmap_sla':
        return (
          <div key={wConfig.id} className={spanClass}>
            <div className="glass-card density-pad space-y-4 h-full">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  6. Heatmap Điểm × Tuần & 7. Hiệu Suất Đóng Lỗi
                </h4>
                <p className="text-xs text-white/75">
                  Ma trận tuân thủ 4 tuần gần nhất và thời gian khắc phục lỗi trung bình
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-white/10 border border-white/25">
                  <div className="text-xs text-white/80">Thời gian xử lý lỗi TB</div>
                  <div className="text-xl font-bold font-mono text-teal-200">
                    {resolutionMetrics.avgHours} giờ
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-white/10 border border-white/25">
                  <div className="text-xs text-white/80">Tỷ lệ đóng đúng hạn</div>
                  <div className="text-xl font-bold font-mono text-emerald-300">
                    {resolutionMetrics.onTimePct}%
                  </div>
                </div>
              </div>

              {/* Mobile: Convert Heatmap Table into Card List; Tablet/Desktop: Scrollable Table */}
              {deviceType === 'mobile' ? (
                <div className="space-y-2">
                  {heatmapMatrix.map((row) => (
                    <div
                      key={row.site.id}
                      className="p-3 rounded-2xl bg-white/10 border border-white/20 space-y-2"
                    >
                      <div className="text-xs font-bold text-white truncate">
                        {row.site.name}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-mono">
                        {row.weeks.map((val, wIdx) => (
                          <div
                            key={wIdx}
                            className={`py-1 rounded-lg ${
                              val === null
                                ? 'bg-white/10 text-white/50'
                                : val >= settings.thresholdGood
                                ? 'bg-emerald-500/35 text-emerald-100 font-bold'
                                : val >= settings.thresholdWarning
                                ? 'bg-amber-500/35 text-amber-100 font-bold'
                                : 'bg-rose-500/40 text-rose-100 font-bold'
                            }`}
                          >
                            <div className="text-[9px] opacity-75">T-{3 - wIdx}</div>
                            <div>{val !== null ? `${Math.round(val)}%` : '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse text-white">
                    <thead>
                      <tr className="text-white/75">
                        <th className="py-1.5 text-left">Điểm rửa xe</th>
                        <th className="py-1.5 text-center">Tuần -3</th>
                        <th className="py-1.5 text-center">Tuần -2</th>
                        <th className="py-1.5 text-center">Tuần -1</th>
                        <th className="py-1.5 text-center">Tuần này</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/15">
                      {heatmapMatrix.map((row) => (
                        <tr key={row.site.id}>
                          <td className="py-2 pr-2 font-semibold truncate max-w-[140px]">
                            {row.site.name}
                          </td>
                          {row.weeks.map((val, wIdx) => {
                            const bg =
                              val === null
                                ? 'bg-white/10 text-white/50'
                                : val >= settings.thresholdGood
                                ? 'bg-emerald-500/35 text-emerald-100 font-bold'
                                : val >= settings.thresholdWarning
                                ? 'bg-amber-500/35 text-amber-100 font-bold'
                                : 'bg-rose-500/40 text-rose-100 font-bold';
                            return (
                              <td key={wIdx} className="p-1 text-center">
                                <div className={`py-1.5 rounded-lg font-mono ${bg}`}>
                                  {val !== null ? `${Math.round(val)}%` : '—'}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. STICKY FILTER BAR (Crystal-Clear White Translucent Tabs & Tools) */}
      <div className="sticky top-14 z-20 glass-panel p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-white/15 border border-white/45 backdrop-blur-md">
          {[
            { id: 'today', label: 'Hôm nay' },
            { id: '7d', label: '7 ngày' },
            { id: '30d', label: '30 ngày' },
            { id: 'quarter', label: 'Quý này' },
            { id: 'custom', label: 'Tùy chọn' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id as PeriodFilter)}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                period === p.id
                  ? 'btn-accent'
                  : 'text-white/95 hover:bg-white/25'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="min-h-[42px] px-2.5 rounded-xl glass-tool text-white text-xs font-mono"
            />
            <span className="text-xs text-white font-bold">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="min-h-[42px] px-2.5 rounded-xl glass-tool text-white text-xs font-mono"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-white/90 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Tìm điểm rửa xe (Phím /)..."
              className="w-full sm:w-52 min-h-[42px] pl-9 pr-3 rounded-xl glass-tool text-white placeholder:text-white/80 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="min-h-[42px] px-3.5 rounded-xl glass-tool text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-white"
          >
            <option value="all">Tất cả loại điểm</option>
            {(Object.keys(SITE_TYPE_LABELS) as SiteType[]).map((k) => (
              <option key={k} value={k}>
                {SITE_TYPE_LABELS[k]}
              </option>
            ))}
          </select>

          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="min-h-[42px] px-3.5 rounded-xl glass-tool text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-white"
          >
            <option value="all">Tất cả điểm ({activeSites.length})</option>
            {activeSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {userRole === 'admin' && (
            <button
              type="button"
              onClick={onOpenManageSites}
              className="min-h-[42px] px-3.5 rounded-xl btn-accent text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Quản lý điểm</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. MAIN DASHBOARD 12-COLUMN ADAPTIVE GRID + DESKTOP RIGHT SIDE DETAIL PANEL */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div
          className={`w-full grid grid-cols-12 density-gap min-w-0 ${
            detailSite && deviceType === 'desktop' ? 'lg:w-7/12' : 'w-full'
          }`}
        >
          {uiPrefs.dashboardWidgets.map((wConfig) => renderWidget(wConfig))}
        </div>

        {/* Desktop (>1024px) Right-Side Detail Panel when clicking a site */}
        {detailSite && deviceType === 'desktop' && (
          <div className="w-full lg:w-5/12 sticky top-32 max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-3xl">
            <SiteDetailView
              site={detailSite}
              overview={overviewMap.get(detailSite.id)}
              checklistItems={checklistItems}
              inspections={inspections}
              inspectionResults={inspectionResults}
              correctiveActions={correctiveActions}
              vehicleWashes={vehicleWashes}
              settings={settings}
              userRole={userRole}
              onBack={() => setDetailSite(null)}
              onStartInspection={(sId) => {
                setDetailSite(null);
                onStartInspection(sId);
              }}
              onViewHistory={(sId) => {
                setDetailSite(null);
                onNavigateTab('history', sId);
              }}
              onManageItems={(s) => onOpenManageItems(s)}
              onShowToast={onShowToast}
            />
          </div>
        )}
      </div>

      {/* KPI Drill-down Modal */}
      {kpiDrilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
          <div className="glass-panel w-full max-w-2xl p-5 sm:p-6 max-h-[85dvh] flex flex-col text-white">
            <div className="flex items-center justify-between pb-3 border-b border-white/20">
              <h3 className="text-base sm:text-lg font-bold">
                {kpiDrilldown === 'inspections' && 'Danh sách lượt kiểm tra trong kỳ'}
                {kpiDrilldown === 'compliance' && 'Chi tiết điểm tuân thủ các trạm'}
                {kpiDrilldown === 'vehicles' && 'Danh sách phương tiện đã xử lý sát khuẩn'}
                {kpiDrilldown === 'overdue_sites' && 'Danh sách điểm quá hạn kiểm tra định kỳ'}
                {kpiDrilldown === 'expiring_chem' && 'Điểm cần kiểm tra / thay dung dịch sát khuẩn'}
              </h3>
              <button
                type="button"
                onClick={() => setKpiDrilldown(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-2.5">
              {kpiDrilldown === 'overdue_sites' &&
                (kpiStats.overdueSites.length === 0 ? (
                  <p className="text-sm text-center py-6">Không có điểm nào quá hạn kiểm tra.</p>
                ) : (
                  kpiStats.overdueSites.map((s) => (
                    <div
                      key={s.id}
                      className="glass-card p-3.5 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-sm">{s.name}</p>
                        <p className="text-xs text-white/75">
                          Chu kỳ quy định: {s.inspect_cycle_days} ngày
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setKpiDrilldown(null);
                          onStartInspection(s.id);
                        }}
                        className="min-h-[44px] px-4 rounded-xl btn-accent text-xs font-bold"
                      >
                        Kiểm tra ngay
                      </button>
                    </div>
                  ))
                ))}

              {kpiDrilldown === 'expiring_chem' &&
                (kpiStats.expiringChemSites.length === 0 ? (
                  <p className="text-sm text-center py-6">
                    Tất cả dung dịch sát khuẩn tại các điểm đều còn hạn tốt.
                  </p>
                ) : (
                  kpiStats.expiringChemSites.map((s) => (
                    <div
                      key={s.id}
                      className="glass-card p-3.5 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-sm">{s.name}</p>
                        <p className="text-xs text-amber-300">
                          Cần kiểm tra nồng độ và thay mới dung dịch sát khuẩn
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setKpiDrilldown(null);
                          setDetailSite(s);
                        }}
                        className="min-h-[44px] px-4 rounded-xl btn-accent text-xs font-bold"
                      >
                        Xem điểm
                      </button>
                    </div>
                  ))
                ))}

              {(kpiDrilldown === 'inspections' || kpiDrilldown === 'compliance') &&
                sortedSites.map((s) => {
                  const ov = overviewMap.get(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setKpiDrilldown(null);
                        setDetailSite(s);
                      }}
                      className="glass-card p-3.5 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <p className="font-bold text-sm">{s.name}</p>
                        <p className="text-xs text-white/75">
                          Đạt: {ov?.pass_items ?? 0} · Lỗi: {ov?.fail_items ?? 0}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-base">
                        {ov?.compliance_pct !== null && ov?.compliance_pct !== undefined
                          ? `${Math.round(ov.compliance_pct)}%`
                          : '—'}
                      </span>
                    </div>
                  );
                })}

              {kpiDrilldown === 'vehicles' &&
                (currentWashes.length === 0 ? (
                  <p className="text-sm text-center py-6">Chưa có lượt rửa xe nào trong kỳ.</p>
                ) : (
                  currentWashes.map((w) => (
                    <div
                      key={w.id}
                      className="glass-card p-3.5 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-mono font-bold text-sm">
                          {w.plate} · {w.vehicle_type}
                        </p>
                        <p className="text-xs text-white/75">
                          Tài xế: {w.driver || '—'} · {new Date(w.started_at).toLocaleString('vi-VN')}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          w.result === 'dat' ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {w.result === 'dat' ? 'ĐẠT' : 'KHÔNG ĐẠT'}
                      </span>
                    </div>
                  ))
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
