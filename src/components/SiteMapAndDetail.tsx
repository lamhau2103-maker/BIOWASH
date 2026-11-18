import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  Download,
  FlaskConical,
  History,
  MapPin,
  Phone,
  Settings2,
  Share2,
} from 'lucide-react';
import {
  buildSiteHistoryCSVRows,
  exportElementToPDF,
  exportToCSV,
  shareReport,
} from '../lib/exportUtils';
import {
  AppSettings,
  CHECKLIST_GROUPS,
  ChecklistItem,
  CorrectiveAction,
  Inspection,
  InspectionResultRow,
  RESULT_LABELS,
  SEVERITY_LABELS,
  Site,
  SiteOverview,
  SITE_TYPE_LABELS,
  UserRole,
  VehicleWash,
} from '../types/database';
import { CircularGauge } from './CommonUI';

// 1. Interactive Leaflet + OpenStreetMap Component (No API Key Required)
export const LeafletSitesMap: React.FC<{
  sites: Site[];
  overviewMap: Map<string, SiteOverview>;
  settings: AppSettings;
  onSelectSite: (site: Site) => void;
}> = ({ sites, overviewMap, settings, onSelectSite }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        center: [11.15, 106.68],
        zoom: 8,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;
    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    const bounds: L.LatLngTuple[] = [];

    sites.forEach((site, idx) => {
      const lat = site.lat ?? 10.8231 + (idx % 5) * 0.12;
      const lng = site.lng ?? 106.6297 + Math.floor(idx / 5) * 0.12;
      bounds.push([lat, lng]);

      const ov = overviewMap.get(site.id);
      const pct = ov?.compliance_pct ?? 100;
      const critFail = ov?.critical_fail ?? 0;

      let pinColor = '#10b981'; // Emerald pass
      if (critFail > 0 || pct < settings.thresholdWarning) {
        pinColor = '#f43f5e'; // Rose fail
      } else if (pct < settings.thresholdGood) {
        pinColor = '#f59e0b'; // Amber warning
      }

      const markerHtml = `
        <div style="
          width: 34px;
          height: 34px;
          border-radius: 9999px;
          background: ${pinColor};
          border: 3px solid #ffffff;
          box-shadow: 0 4px 14px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-weight: 700;
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
        ">
          ${ov?.compliance_pct !== null && ov?.compliance_pct !== undefined ? `${Math.round(ov.compliance_pct)}%` : '—'}
        </div>
      `;

      const icon = L.divIcon({
        html: markerHtml,
        className: 'biowash-custom-pin',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(map);
      marker.bindTooltip(
        `<strong>${site.name}</strong><br/>Tuân thủ: ${
          ov?.compliance_pct !== null && ov?.compliance_pct !== undefined
            ? `${Math.round(ov.compliance_pct)}%`
            : 'Chưa KT'
        } · Lỗi mở: ${ov?.open_actions ?? 0}`,
        { direction: 'top', offset: [0, -14] }
      );
      marker.on('click', () => onSelectSite(site));
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }

    return () => {
      // Keep instance alive during updates, clean up on unmount
    };
  }, [sites, overviewMap, settings.thresholdGood, settings.thresholdWarning, onSelectSite]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="glass-card rounded-3xl p-3 overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-[420px] rounded-2xl" />
    </div>
  );
};

// 2. Single Site Detail View (Radar 6 Groups, Last 10 Inspections, Open Actions, Chemical Info)
export const SiteDetailView: React.FC<{
  site: Site;
  overview?: SiteOverview;
  checklistItems: ChecklistItem[];
  inspections: Inspection[];
  inspectionResults: InspectionResultRow[];
  correctiveActions: CorrectiveAction[];
  vehicleWashes: VehicleWash[];
  settings: AppSettings;
  userRole: UserRole;
  onBack: () => void;
  onStartInspection: (siteId: string) => void;
  onViewHistory: (siteId: string) => void;
  onManageItems: (site: Site) => void;
  onShowToast: (msg: string) => void;
}> = ({
  site,
  overview,
  inspections,
  inspectionResults,
  correctiveActions,
  vehicleWashes,
  settings,
  userRole,
  onBack,
  onStartInspection,
  onViewHistory,
  onManageItems,
  onShowToast,
}) => {
  const [exporting, setExporting] = useState(false);

  const siteInspections = useMemo(
    () =>
      inspections
        .filter((i) => i.site_id === site.id && i.status === 'completed')
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
    [inspections, site.id]
  );

  const recent10Inspections = useMemo(() => siteInspections.slice(0, 10), [siteInspections]);

  const siteOpenActions = useMemo(
    () => correctiveActions.filter((a) => a.site_id === site.id && a.status !== 'closed'),
    [correctiveActions, site.id]
  );

  // Extract chemical info from latest inspection
  const latestChemical = useMemo(() => {
    for (const ins of siteInspections) {
      if (ins.gps?.chemical_info?.name) {
        return ins.gps.chemical_info;
      }
    }
    return null;
  }, [siteInspections]);

  const chemExpiryStatus = useMemo(() => {
    if (!latestChemical?.expiry_date) return { label: 'Chưa cập nhật hạn', color: 'text-slate-400' };
    const daysLeft = Math.ceil(
      (new Date(latestChemical.expiry_date).getTime() - Date.now()) / 86400000
    );
    if (daysLeft < 0) {
      return {
        label: `Đã quá hạn ${Math.abs(daysLeft)} ngày!`,
        color: 'text-rose-600 dark:text-rose-400 font-bold',
      };
    }
    if (daysLeft <= 2) {
      return {
        label: `Sắp hết hạn (còn ${daysLeft} ngày)`,
        color: 'text-amber-600 dark:text-amber-400 font-bold',
      };
    }
    return {
      label: `Còn hạn sử dụng (${daysLeft} ngày)`,
      color: 'text-emerald-600 dark:text-emerald-400 font-bold',
    };
  }, [latestChemical]);

  // Compute Radar groups dynamically: Current inspection vs Previous inspection
  const radarData = useMemo(() => {
    const latestInsp = siteInspections[0];
    const prevInsp = siteInspections[1];

    const latestRes = latestInsp
      ? inspectionResults.filter((r) => r.inspection_id === latestInsp.id)
      : [];
    const prevRes = prevInsp
      ? inspectionResults.filter((r) => r.inspection_id === prevInsp.id)
      : [];

    const cleanGroup = (raw: string) =>
      (raw || '').trim().replace(/^\d+\s*[).:-]\s*/, '').trim();

    const groupSet = new Map<string, string>();
    latestRes.forEach((r) => {
      const c = cleanGroup(r.group_name);
      if (c && !groupSet.has(c.toLowerCase())) groupSet.set(c.toLowerCase(), c);
    });
    prevRes.forEach((r) => {
      const c = cleanGroup(r.group_name);
      if (c && !groupSet.has(c.toLowerCase())) groupSet.set(c.toLowerCase(), c);
    });

    if (groupSet.size === 0) {
      CHECKLIST_GROUPS.forEach((grp) => {
        const c = cleanGroup(grp);
        groupSet.set(c.toLowerCase(), c);
      });
    }

    return Array.from(groupSet.entries()).map(([normKey, shortName]) => {
      const calcScore = (rows: InspectionResultRow[]) => {
        const gRows = rows.filter((r) => cleanGroup(r.group_name).toLowerCase() === normKey);
        const pass = gRows.filter((r) => r.status === 'pass').length;
        const fail = gRows.filter((r) => r.status === 'fail').length;
        return pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : 100;
      };
      return {
        group: shortName,
        kyNay: latestInsp ? calcScore(latestRes) : overview?.compliance_pct ?? 100,
        kyTruoc: prevInsp ? calcScore(prevRes) : 85,
      };
    });
  }, [siteInspections, inspectionResults, overview]);

  const handleExportSiteReport = async () => {
    setExporting(true);
    try {
      await exportElementToPDF(
        'site-detail-export-container',
        `BaoCaoDiem_${site.name.replace(/\s+/g, '_')}`
      );
      const csvRows = buildSiteHistoryCSVRows(
        site,
        siteInspections,
        inspectionResults,
        siteOpenActions,
        vehicleWashes.filter((w) => w.site_id === site.id)
      );
      if (csvRows.length > 0) {
        exportToCSV(`DuLieuDiem_${site.name.replace(/\s+/g, '_')}`, csvRows);
      }
      onShowToast('Đã xuất báo cáo PDF & Excel của điểm rửa xe');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="site-detail-export-container" className="space-y-4 pb-8">
      {/* Top Action Header */}
      <div className="glass-card rounded-3xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-slate-200/80 dark:bg-white/10 flex items-center justify-center hover:bg-teal-500/20 transition shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-2xl font-bold">{site.name}</h2>
              <span className="text-xs sm:text-sm text-teal-700 dark:text-teal-300 font-semibold">
                · {SITE_TYPE_LABELS[site.site_type]}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2">
              <MapPin className="w-3.5 h-3.5 inline text-teal-400" />
              <span>{site.address || 'Chưa cập nhật địa chỉ'}</span>
              <span>·</span>
              <span>Phụ trách: {site.manager_name || '—'}</span>
              {site.manager_phone && (
                <>
                  <span>·</span>
                  <a
                    href={`tel:${site.manager_phone}`}
                    className="text-teal-600 dark:text-teal-300 underline font-mono inline-flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" />
                    {site.manager_phone}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(userRole === 'admin' || userRole === 'inspector') && (
            <>
              <button
                type="button"
                onClick={() => onStartInspection(site.id)}
                className="min-h-[46px] px-4 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-lg shadow-teal-600/25"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Bắt đầu kiểm tra</span>
              </button>
              <button
                type="button"
                onClick={() => onManageItems(site)}
                className="min-h-[46px] px-3.5 rounded-2xl bg-slate-200/80 dark:bg-white/10 text-xs sm:text-sm font-semibold flex items-center gap-1.5"
              >
                <Settings2 className="w-4 h-4" />
                <span>Quản lý hạng mục</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onViewHistory(site.id)}
            className="min-h-[46px] px-3.5 rounded-2xl bg-slate-200/80 dark:bg-white/10 text-xs sm:text-sm font-semibold flex items-center gap-1.5"
          >
            <History className="w-4 h-4" />
            <span>Xem lịch sử</span>
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportSiteReport}
            className="min-h-[46px] px-3.5 rounded-2xl bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Đang xuất...' : 'Xuất báo cáo điểm này'}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              shareReport(
                `Báo cáo điểm ${site.name}`,
                `Điểm tuân thủ: ${Math.round(overview?.compliance_pct ?? 100)}% - Lỗi đang mở: ${siteOpenActions.length}`
              )
            }
            className="min-h-[46px] px-3 rounded-2xl bg-slate-200/80 dark:bg-white/10 text-xs font-semibold flex items-center gap-1"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top Row: Radar 6 Groups & Disinfectant Chemical Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">Biểu Đồ Radar 6 Nhóm Tiêu Chuẩn</h3>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                So sánh điểm tuân thủ Kỳ này (Xanh ngọc) và Kỳ trước (Xanh dương)
              </p>
            </div>
            <CircularGauge
              percentage={overview?.compliance_pct ?? 100}
              size={64}
              strokeWidth={6}
              thresholdGood={settings.thresholdGood}
              thresholdWarn={settings.thresholdWarning}
            />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="rgba(148,163,184,0.3)" />
                <PolarAngleAxis
                  dataKey="group"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  name="Kỳ trước"
                  dataKey="kyTruoc"
                  stroke="#38bdf8"
                  fill="#38bdf8"
                  fillOpacity={0.2}
                />
                <Radar
                  name="Kỳ này"
                  dataKey="kyNay"
                  stroke="#14b8a6"
                  fill="#14b8a6"
                  fillOpacity={0.45}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chemical Disinfectant Info & Open Errors Summary */}
        <div className="space-y-4">
          <div className="glass-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-300">
                <FlaskConical className="w-5 h-5" />
                <span>Hóa Chất Sát Khuẩn Đang Dùng</span>
              </div>
              <span className={`text-xs ${chemExpiryStatus.color}`}>
                {chemExpiryStatus.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 rounded-2xl bg-white/50 dark:bg-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Tên hóa chất</div>
                <div className="text-xs sm:text-sm font-bold mt-0.5">
                  {latestChemical?.name || 'Virkon S / Glutaraldehyde'}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/50 dark:bg-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Nồng độ pha</div>
                <div className="text-xs sm:text-sm font-mono font-bold mt-0.5">
                  {latestChemical?.concentration || '1.0%'}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/50 dark:bg-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Ngày pha</div>
                <div className="text-xs sm:text-sm font-mono font-bold mt-0.5">
                  {latestChemical?.mixed_date || '—'}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/50 dark:bg-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Hạn dùng</div>
                <div className="text-xs sm:text-sm font-mono font-bold mt-0.5">
                  {latestChemical?.expiry_date || '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <span>Lỗi Đang Mở Tại Điểm Này ({siteOpenActions.length})</span>
            </h3>
            {siteOpenActions.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                Không có lỗi tồn đọng tại điểm này ✅
              </p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {siteOpenActions.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 rounded-2xl bg-rose-500/10 border border-rose-400/30 flex items-start justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-bold">{act.description}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        Phụ trách: {act.assignee || site.manager_name || '—'} · Hạn:{' '}
                        {act.due_date ? new Date(act.due_date).toLocaleDateString('vi-VN') : '—'}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-rose-600 dark:text-rose-300 shrink-0">
                      {act.severity ? SEVERITY_LABELS[act.severity] : 'Nghiêm trọng'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 10 Recent Inspections Table */}
      <div className="glass-card rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-400" />
            <span>10 Lần Kiểm Tra Gần Nhất</span>
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-300">
            Chu kỳ quy định: {site.inspect_cycle_days} ngày/lần
          </span>
        </div>

        {recent10Inspections.length === 0 ? (
          <p className="text-xs text-white/70 py-4 text-center">
            Điểm này chưa có lịch sử hoàn tất kiểm tra.
          </p>
        ) : (
          <>
            {/* Mobile (<640px): Card List */}
            <div className="sm:hidden space-y-2">
              {recent10Inspections.map((ins) => (
                <div
                  key={ins.id}
                  className="p-3 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-mono text-white/80">
                      {new Date(ins.started_at).toLocaleString('vi-VN')}
                    </div>
                    <div className="text-xs font-semibold text-white">
                      Người KT: {ins.inspector_name || '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-white">
                      {ins.score !== null ? `${Math.round(ins.score)}%` : '—'}
                    </div>
                    <div
                      className={`text-xs font-bold ${
                        ins.result === 'tot'
                          ? 'text-emerald-300'
                          : ins.result === 'can_cai_thien'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {ins.result ? RESULT_LABELS[ins.result] : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet & Desktop (>=640px): Scrollable Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm text-white">
                <thead>
                  <tr className="border-b border-white/20 text-white/75">
                    <th className="py-2.5 px-3">Thời gian</th>
                    <th className="py-2.5 px-3">Người kiểm tra</th>
                    <th className="py-2.5 px-3 text-right">Điểm số</th>
                    <th className="py-2.5 px-3">Xếp loại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/15">
                  {recent10Inspections.map((ins) => (
                    <tr key={ins.id} className="hover:bg-white/10">
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {new Date(ins.started_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2.5 px-3 font-medium">{ins.inspector_name || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        {ins.score !== null ? `${Math.round(ins.score)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <span
                          className={
                            ins.result === 'tot'
                              ? 'text-emerald-300'
                              : ins.result === 'can_cai_thien'
                              ? 'text-amber-300'
                              : 'text-rose-300'
                          }
                        >
                          {ins.result ? RESULT_LABELS[ins.result] : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
