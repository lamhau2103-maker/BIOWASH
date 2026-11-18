import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Share2,
  Truck,
  ClipboardCheck,
  Eye,
  X,
  Edit3,
  Trash2,
} from 'lucide-react';
import {
  buildSiteHistoryCSVRows,
  exportElementToPDF,
  exportToCSV,
  shareReport,
} from '../lib/exportUtils';
import { repository } from '../lib/repository';
import {
  CorrectiveAction,
  Inspection,
  InspectionResultRow,
  RESULT_LABELS,
  Site,
  SITE_TYPE_LABELS,
  UserRole,
  VehicleWash,
} from '../types/database';

interface HistoryViewProps {
  sites: Site[];
  inspections: Inspection[];
  inspectionResults: InspectionResultRow[];
  correctiveActions: CorrectiveAction[];
  vehicleWashes: VehicleWash[];
  initialSiteFilter?: string | null;
  userRole?: UserRole;
  onRefresh?: () => void;
  onShowToast: (msg: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sites,
  inspections,
  inspectionResults,
  correctiveActions,
  vehicleWashes,
  initialSiteFilter = null,
  userRole = 'viewer',
  onRefresh,
  onShowToast,
}) => {
  const isAdmin = userRole === 'admin';
  const [tab, setTab] = useState<'inspections' | 'washes'>('inspections');
  const [siteFilter, setSiteFilter] = useState<string>(initialSiteFilter || 'all');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Super Admin Edit States
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [editInspectorName, setEditInspectorName] = useState('');
  const [editScore, setEditScore] = useState('');
  const [editResult, setEditResult] = useState<'tot' | 'can_cai_thien' | 'khong_dat'>('tot');

  const [editingWash, setEditingWash] = useState<VehicleWash | null>(null);
  const [editPlate, setEditPlate] = useState('');
  const [editVehicleType, setEditVehicleType] = useState('Xe cám');
  const [editDriver, setEditDriver] = useState('');
  const [editOrigin, setEditOrigin] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editWashResult, setEditWashResult] = useState<'dat' | 'khong_dat'>('dat');
  const [savingAdminEdit, setSavingAdminEdit] = useState(false);

  const siteMap = useMemo(() => {
    const m = new Map<string, Site>();
    sites.forEach((s) => m.set(s.id, s));
    return m;
  }, [sites]);

  const filteredInspections = useMemo(() => {
    return inspections.filter((ins) => {
      if (siteFilter !== 'all' && ins.site_id !== siteFilter) return false;
      if (resultFilter !== 'all' && ins.result !== resultFilter) return false;
      if (dateFrom && ins.started_at < dateFrom) return false;
      if (dateTo && ins.started_at.slice(0, 10) > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const sName = siteMap.get(ins.site_id)?.name.toLowerCase() || '';
        const inspector = (ins.inspector_name || '').toLowerCase();
        if (!sName.includes(q) && !inspector.includes(q)) return false;
      }
      return true;
    });
  }, [inspections, siteFilter, resultFilter, dateFrom, dateTo, searchQuery, siteMap]);

  const filteredWashes = useMemo(() => {
    return vehicleWashes.filter((w) => {
      if (siteFilter !== 'all' && w.site_id !== siteFilter) return false;
      if (resultFilter !== 'all' && w.result !== resultFilter) return false;
      if (vehicleTypeFilter !== 'all' && w.vehicle_type !== vehicleTypeFilter) return false;
      if (dateFrom && w.started_at < dateFrom) return false;
      if (dateTo && w.started_at.slice(0, 10) > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const plateMatch = w.plate.toLowerCase().includes(q);
        const driverMatch = (w.driver || '').toLowerCase().includes(q);
        const siteMatch = (siteMap.get(w.site_id)?.name || '').toLowerCase().includes(q);
        if (!plateMatch && !driverMatch && !siteMatch) return false;
      }
      return true;
    });
  }, [
    vehicleWashes,
    siteFilter,
    resultFilter,
    vehicleTypeFilter,
    dateFrom,
    dateTo,
    searchQuery,
    siteMap,
  ]);

  const handleExportCSV = () => {
    const selectedSite = siteFilter !== 'all' ? siteMap.get(siteFilter) : undefined;
    const rows = buildSiteHistoryCSVRows(
      selectedSite,
      filteredInspections,
      inspectionResults,
      correctiveActions,
      filteredWashes
    );
    if (rows.length === 0) {
      onShowToast('Không có dữ liệu để xuất CSV.');
      return;
    }
    exportToCSV(`BioWash_BaoCao_${new Date().toISOString().slice(0, 10)}`, rows);
    onShowToast('Đã tải xuống báo cáo Excel/CSV');
  };

  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      await exportElementToPDF(
        'history-export-area',
        `BioWash_BienBan_${new Date().toISOString().slice(0, 10)}`
      );
      onShowToast('Đã xuất báo cáo PDF đầy đủ');
    } catch {
      onShowToast('Không thể xuất PDF. Vui lòng thử lại.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleShare = async () => {
    const ok = await shareReport(
      'Báo cáo Thái Việt Corporation',
      `Tổng hợp ${filteredInspections.length} lượt kiểm tra điểm và ${filteredWashes.length} lượt rửa xe sát khuẩn.`
    );
    if (ok) {
      onShowToast('Đã chia sẻ báo cáo thành công');
    }
  };

  const openEditInspection = (ins: Inspection) => {
    setEditingInspection(ins);
    setEditInspectorName(ins.inspector_name || '');
    setEditScore(ins.score !== null ? String(Math.round(ins.score)) : '100');
    setEditResult(ins.result || 'tot');
  };

  const handleSaveInspectionEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInspection || !isAdmin) return;
    setSavingAdminEdit(true);
    try {
      const numericScore = Math.min(100, Math.max(0, Number(editScore) || 0));
      await repository.updateInspection(editingInspection.id, {
        inspector_name: editInspectorName.trim() || 'Quản trị viên cao nhất (Admin)',
        score: numericScore,
        result: editResult,
        status: 'completed',
      });
      setEditingInspection(null);
      onRefresh?.();
      onShowToast('Đã cập nhật biên bản kiểm tra.');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi khi cập nhật biên bản.');
    } finally {
      setSavingAdminEdit(false);
    }
  };

  const handleDeleteInspection = async (inspectionId: string) => {
    if (!isAdmin) return;
    try {
      await repository.deleteInspection(inspectionId);
      onRefresh?.();
      onShowToast('Đã xóa biên bản kiểm tra.');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Không thể xóa biên bản.');
    }
  };

  const openEditWash = (w: VehicleWash) => {
    setEditingWash(w);
    setEditPlate(w.plate);
    setEditVehicleType(w.vehicle_type);
    setEditDriver(w.driver || '');
    setEditOrigin(w.origin || '');
    setEditDestination(w.destination || '');
    setEditWashResult(w.result === 'khong_dat' ? 'khong_dat' : 'dat');
  };

  const handleSaveWashEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWash || !isAdmin) return;
    setSavingAdminEdit(true);
    try {
      await repository.updateVehicleWash(editingWash.id, {
        plate: editPlate.trim().toUpperCase(),
        vehicle_type: editVehicleType,
        driver: editDriver.trim() || null,
        origin: editOrigin.trim() || null,
        destination: editDestination.trim() || null,
        result: editWashResult,
      });
      setEditingWash(null);
      onRefresh?.();
      onShowToast('Đã cập nhật lượt rửa xe sát khuẩn.');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi khi cập nhật lượt rửa xe.');
    } finally {
      setSavingAdminEdit(false);
    }
  };

  const handleDeleteWash = async (washId: string) => {
    if (!isAdmin) return;
    try {
      await repository.deleteVehicleWash(washId);
      onRefresh?.();
      onShowToast('Đã xóa lượt rửa xe.');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Không thể xóa lượt rửa xe.');
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Filter & Export Header */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/15 border border-white/45 backdrop-blur-md self-start">
            <button
              type="button"
              onClick={() => {
                setTab('inspections');
                setResultFilter('all');
              }}
              className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
                tab === 'inspections'
                  ? 'btn-accent text-white shadow'
                  : 'text-white/95 hover:bg-white/25'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Lịch sử Kiểm tra ({filteredInspections.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('washes');
                setResultFilter('all');
              }}
              className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
                tab === 'washes'
                  ? 'btn-accent text-white shadow'
                  : 'text-white/95 hover:bg-white/25'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Lịch sử Rửa xe ({filteredWashes.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="min-h-[44px] px-3.5 rounded-xl bg-rose-500/85 hover:bg-rose-500 border border-white/50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <FileText className="w-4 h-4" />
              <span>{exportingPdf ? 'Đang tạo PDF...' : 'Xuất PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="min-h-[44px] px-3.5 rounded-xl bg-emerald-500/85 hover:bg-emerald-500 border border-white/50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel/CSV</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="min-h-[44px] px-3.5 rounded-xl btn-accent text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Share2 className="w-4 h-4" />
              <span>Chia sẻ nhanh</span>
            </button>
          </div>
        </div>

        {/* Filter Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-white/90 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm biển số, người KT, điểm..."
              className="w-full min-h-[44px] pl-9 pr-3 rounded-xl glass-tool text-white placeholder:text-white/80 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>

          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="min-h-[44px] px-3 rounded-xl glass-tool text-white text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-white"
          >
            <option value="all">Tất cả điểm rửa xe</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {tab === 'inspections' ? (
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="min-h-[44px] px-3 rounded-xl glass-tool text-white text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-white"
            >
              <option value="all">Mọi kết quả</option>
              <option value="tot">Tốt (≥90%)</option>
              <option value="can_cai_thien">Cần cải thiện (75-89%)</option>
              <option value="khong_dat">Không đạt (&lt;75%)</option>
            </select>
          ) : (
            <select
              value={vehicleTypeFilter}
              onChange={(e) => setVehicleTypeFilter(e.target.value)}
              className="min-h-[44px] px-3 rounded-xl glass-tool text-white text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-white"
            >
              <option value="all">Mọi loại xe</option>
              <option value="Xe cám">Xe cám</option>
              <option value="Xe gà">Xe gà</option>
              <option value="Xe heo">Xe heo</option>
              <option value="Xe vật tư">Xe vật tư</option>
              <option value="Xe ngoài">Xe ngoài</option>
            </select>
          )}

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="min-h-[44px] px-3 rounded-xl glass-tool text-white text-xs font-mono"
            title="Từ ngày"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="min-h-[44px] px-3 rounded-xl glass-tool text-white text-xs font-mono"
            title="Đến ngày"
          />
        </div>
      </div>

      {/* Printable / Exportable Area */}
      <div id="history-export-area" className="space-y-3">
        {tab === 'inspections' ? (
          filteredInspections.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 text-center text-sm text-slate-600 dark:text-slate-300">
              Chưa có biên bản kiểm tra nào khớp bộ lọc.
            </div>
          ) : (
            filteredInspections.map((ins) => {
              const site = siteMap.get(ins.site_id);
              const insResults = inspectionResults.filter((r) => r.inspection_id === ins.id);
              const passCount = insResults.filter((r) => r.status === 'pass').length;
              const failCount = insResults.filter((r) => r.status === 'fail').length;

              return (
                <div
                  key={ins.id}
                  className="glass-card rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                        {site?.name || 'Điểm rửa xe'}
                      </span>
                      {site && (
                        <>
                          <span>·</span>
                          <span className="text-slate-500 dark:text-sky-300">
                            {SITE_TYPE_LABELS[site.site_type]}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-300">
                        {new Date(ins.started_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Người kiểm tra: <strong>{ins.inspector_name || '—'}</strong> · Đạt:{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">{passCount}</strong> ·
                      Không đạt:{' '}
                      <strong className="text-rose-600 dark:text-rose-400">{failCount}</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center">
                    <div className="text-right mr-1">
                      <div className="font-mono text-lg font-bold tabular-nums">
                        {ins.score !== null ? `${Math.round(ins.score)}%` : 'Nháp'}
                      </div>
                      <div
                        className={`text-xs font-bold ${
                          ins.result === 'tot'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ins.result === 'can_cai_thien'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {ins.result ? RESULT_LABELS[ins.result] : 'Đang lưu nháp'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedInspection(ins)}
                      className="min-h-[44px] px-3.5 rounded-xl bg-sky-500/20 border border-sky-400/35 text-sky-100 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Chi tiết</span>
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditInspection(ins)}
                          className="min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold flex items-center gap-1"
                          title="Chỉnh sửa biên bản"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInspection(ins.id)}
                          className="min-h-[44px] px-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/35 text-rose-200 text-xs font-semibold flex items-center"
                          title="Xóa biên bản"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : filteredWashes.length === 0 ? (
          <div className="glass-card rounded-3xl p-8 text-center text-sm text-slate-600 dark:text-slate-300">
            Chưa có lượt rửa xe sát khuẩn nào khớp bộ lọc.
          </div>
        ) : (
          filteredWashes.map((w) => {
            const site = siteMap.get(w.site_id);
            const completedSteps = (w.steps || []).filter((s) => s.status === 'completed').length;

            return (
              <div
                key={w.id}
                className="glass-card rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-bold text-sky-300">
                      {w.plate}
                    </span>
                    <span>·</span>
                    <span className="text-xs sm:text-sm font-semibold">{w.vehicle_type}</span>
                    <span>·</span>
                    <span className="text-xs text-slate-500 dark:text-slate-300">
                      Tại: {site?.name || '—'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Tài xế: {w.driver || '—'} · Lộ trình: {w.origin || '—'} → {w.destination || '—'} ·
                    Hoàn thành {completedSteps}/7 bước
                  </p>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-center">
                  <div className="text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-300 mr-1">
                    <div>{new Date(w.started_at).toLocaleString('vi-VN')}</div>
                    <div
                      className={`font-bold text-sm ${
                        w.result === 'dat'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : w.result === 'khong_dat'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-500'
                      }`}
                    >
                      {w.result === 'dat'
                        ? 'ĐẠT'
                        : w.result === 'khong_dat'
                        ? 'KHÔNG ĐẠT'
                        : 'Đang xử lý'}
                    </div>
                  </div>

                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditWash(w)}
                        className="min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold flex items-center gap-1"
                        title="Chỉnh sửa lượt rửa xe"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWash(w.id)}
                        className="min-h-[44px] px-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/35 text-rose-200 text-xs font-semibold flex items-center"
                        title="Xóa lượt rửa xe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Super Admin Edit Inspection Modal */}
      {editingInspection && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
          <form
            onSubmit={handleSaveInspectionEdit}
            className="glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 space-y-4 text-slate-900"
          >
            <div className="flex items-center justify-between border-b border-white/60 pb-3">
              <h3 className="text-base font-bold">Chỉnh sửa Biên bản Kiểm tra (Admin)</h3>
              <button
                type="button"
                onClick={() => setEditingInspection(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center glass-tool hover:bg-white/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">Người kiểm tra</label>
                <input
                  type="text"
                  value={editInspectorName}
                  onChange={(e) => setEditInspectorName(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl glass-tool text-sm font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Điểm tuân thủ (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editScore}
                    onChange={(e) => setEditScore(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl glass-tool text-sm font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Kết luận</label>
                  <select
                    value={editResult}
                    onChange={(e) =>
                      setEditResult(e.target.value as 'tot' | 'can_cai_thien' | 'khong_dat')
                    }
                    className="w-full min-h-[46px] px-3 rounded-xl glass-tool text-sm font-semibold"
                  >
                    <option value="tot">Tốt</option>
                    <option value="can_cai_thien">Cần cải thiện</option>
                    <option value="khong_dat">Không đạt</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingInspection(null)}
                className="min-h-[44px] px-4 rounded-xl glass-tool text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingAdminEdit}
                className="min-h-[44px] px-5 rounded-xl btn-accent text-xs font-bold"
              >
                {savingAdminEdit ? 'Đang lưu...' : 'Lưu cập nhật'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Super Admin Edit Vehicle Wash Modal */}
      {editingWash && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
          <form
            onSubmit={handleSaveWashEdit}
            className="glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 space-y-4 text-slate-900"
          >
            <div className="flex items-center justify-between border-b border-white/60 pb-3">
              <h3 className="text-base font-bold">Chỉnh sửa Lượt Rửa Xe (Admin)</h3>
              <button
                type="button"
                onClick={() => setEditingWash(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center glass-tool hover:bg-white/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Biển số xe</label>
                  <input
                    type="text"
                    value={editPlate}
                    onChange={(e) => setEditPlate(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl glass-tool text-sm font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Loại xe</label>
                  <select
                    value={editVehicleType}
                    onChange={(e) => setEditVehicleType(e.target.value)}
                    className="w-full min-h-[46px] px-3 rounded-xl glass-tool text-sm font-semibold"
                  >
                    <option value="Xe cám">Xe cám</option>
                    <option value="Xe gà">Xe gà</option>
                    <option value="Xe heo">Xe heo</option>
                    <option value="Xe vật tư">Xe vật tư</option>
                    <option value="Xe ngoài">Xe ngoài</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Tài xế</label>
                <input
                  type="text"
                  value={editDriver}
                  onChange={(e) => setEditDriver(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl glass-tool text-sm font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Nơi đi</label>
                  <input
                    type="text"
                    value={editOrigin}
                    onChange={(e) => setEditOrigin(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl glass-tool text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Nơi đến</label>
                  <input
                    type="text"
                    value={editDestination}
                    onChange={(e) => setEditDestination(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl glass-tool text-sm font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Kết quả</label>
                <select
                  value={editWashResult}
                  onChange={(e) => setEditWashResult(e.target.value as 'dat' | 'khong_dat')}
                  className="w-full min-h-[46px] px-3 rounded-xl glass-tool text-sm font-semibold"
                >
                  <option value="dat">ĐẠT</option>
                  <option value="khong_dat">KHÔNG ĐẠT</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingWash(null)}
                className="min-h-[44px] px-4 rounded-xl glass-tool text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingAdminEdit}
                className="min-h-[44px] px-5 rounded-xl btn-accent text-xs font-bold"
              >
                {savingAdminEdit ? 'Đang lưu...' : 'Lưu cập nhật'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inspection Detail Modal for PDF Report & Evidence Inspection */}
      {selectedInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-3 sm:p-6">
          <div className="glass-panel w-full max-w-3xl rounded-3xl p-5 sm:p-7 max-h-[90vh] flex flex-col text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-300/40 dark:border-white/15">
              <div>
                <h3 className="text-lg font-bold">
                  Biên Bản Kiểm Tra · {siteMap.get(selectedInspection.site_id)?.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-300 font-mono">
                  {new Date(selectedInspection.started_at).toLocaleString('vi-VN')} · Người KT:{' '}
                  {selectedInspection.inspector_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportElementToPDF(
                      'modal-inspection-pdf',
                      `BienBan_${selectedInspection.id.slice(0, 8)}`
                    )
                  }
                  className="min-h-[42px] px-3.5 rounded-xl bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInspection(null)}
                  className="min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div id="modal-inspection-pdf" className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass-card rounded-2xl p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-300">Điểm tuân thủ</div>
                  <div className="text-xl font-bold font-mono">
                    {selectedInspection.score !== null
                      ? `${Math.round(selectedInspection.score)}%`
                      : '—'}
                  </div>
                </div>
                <div className="glass-card rounded-2xl p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-300">Kết luận</div>
                  <div className="text-base font-bold">
                    {selectedInspection.result
                      ? RESULT_LABELS[selectedInspection.result]
                      : 'Nháp'}
                  </div>
                </div>
                <div className="glass-card rounded-2xl p-3 sm:col-span-2">
                  <div className="text-xs text-slate-500 dark:text-slate-300">Hóa chất ghi nhận</div>
                  <div className="text-xs font-semibold">
                    {selectedInspection.gps?.chemical_info?.name || 'Chưa ghi nhận'}{' '}
                    {selectedInspection.gps?.chemical_info?.concentration
                      ? `(${selectedInspection.gps.chemical_info.concentration})`
                      : ''}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-300">
                  Kết quả từng hạng mục
                </h4>
                {inspectionResults
                  .filter((r) => r.inspection_id === selectedInspection.id)
                  .map((r) => (
                    <div key={r.id || r.item_id} className="glass-card rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs text-slate-500 dark:text-slate-300">
                            {r.group_name}
                          </span>
                          <p className="text-sm font-semibold">{r.item_title}</p>
                        </div>
                        <span
                          className={`text-xs font-bold shrink-0 ${
                            r.status === 'pass'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : r.status === 'fail'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {r.status === 'pass'
                            ? 'ĐẠT'
                            : r.status === 'fail'
                            ? 'KHÔNG ĐẠT'
                            : 'K.ÁP DỤNG'}
                        </span>
                      </div>
                      {r.note && (
                        <p className="text-xs text-rose-600 dark:text-rose-300">
                          Ghi chú: {r.note}
                        </p>
                      )}
                      {r.photo_urls && r.photo_urls.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {r.photo_urls.map((u, idx) => (
                            <img
                              key={idx}
                              src={u}
                              alt="Minh chứng"
                              referrerPolicy="no-referrer"
                              className="w-20 h-20 rounded-xl object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              {(selectedInspection.signature_url ||
                selectedInspection.gps?.rep_signature_url) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {selectedInspection.signature_url && (
                    <div className="glass-card rounded-2xl p-3 text-center">
                      <div className="text-xs font-semibold mb-2">Chữ ký Người kiểm tra</div>
                      <img
                        src={selectedInspection.signature_url}
                        alt="Chữ ký người kiểm tra"
                        referrerPolicy="no-referrer"
                        className="max-h-24 mx-auto bg-white rounded-xl p-2"
                      />
                    </div>
                  )}
                  {selectedInspection.gps?.rep_signature_url && (
                    <div className="glass-card rounded-2xl p-3 text-center">
                      <div className="text-xs font-semibold mb-2">Chữ ký Đại diện điểm</div>
                      <img
                        src={selectedInspection.gps.rep_signature_url}
                        alt="Chữ ký đại diện"
                        referrerPolicy="no-referrer"
                        className="max-h-24 mx-auto bg-white rounded-xl p-2"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
