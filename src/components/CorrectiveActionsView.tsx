import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Plus,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { repository } from '../lib/repository';
import {
  ActionStatus,
  ACTION_STATUS_LABELS,
  CorrectiveAction,
  SeverityLevel,
  SEVERITY_LABELS,
  Site,
  UserRole,
} from '../types/database';

interface CorrectiveActionsViewProps {
  actions: CorrectiveAction[];
  sites: Site[];
  userRole: UserRole;
  initialFilterSiteId?: string | null;
  onRefresh: () => void;
  onShowToast: (msg: string) => void;
}

export const CorrectiveActionsView: React.FC<CorrectiveActionsViewProps> = ({
  actions,
  sites,
  userRole,
  initialFilterSiteId = null,
  onRefresh,
  onShowToast,
}) => {
  const canEdit = userRole === 'admin' || userRole === 'inspector';
  const [statusFilter, setStatusFilter] = useState<'all' | ActionStatus | 'overdue'>('all');
  const [siteFilter, setSiteFilter] = useState<string>(initialFilterSiteId || 'all');
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Add / Edit / Delete modal states for full Admin management
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAction, setEditingAction] = useState<CorrectiveAction | null>(null);
  const [confirmDeleteAction, setConfirmDeleteAction] = useState<CorrectiveAction | null>(null);

  const [formSiteId, setFormSiteId] = useState<string>(sites[0]?.id || '');
  const [formDescription, setFormDescription] = useState('');
  const [formSeverity, setFormSeverity] = useState<SeverityLevel>('nghiem_trong');
  const [formAssignee, setFormAssignee] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formStatus, setFormStatus] = useState<ActionStatus>('open');

  const siteMap = useMemo(() => {
    const m = new Map<string, Site>();
    sites.forEach((s) => m.set(s.id, s));
    return m;
  }, [sites]);

  const nowTime = Date.now();

  const isActionOverdue = (a: CorrectiveAction) => {
    if (a.status === 'closed' || !a.due_date) return false;
    const dueTime = new Date(a.due_date).getTime() + 86400000;
    return dueTime < nowTime;
  };

  const getDaysLate = (a: CorrectiveAction) => {
    if (!a.due_date) return 0;
    const diff = nowTime - new Date(a.due_date).getTime();
    return Math.max(1, Math.floor(diff / 86400000));
  };

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (siteFilter !== 'all' && a.site_id !== siteFilter) return false;
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (statusFilter === 'overdue') {
        if (!isActionOverdue(a)) return false;
      } else if (statusFilter !== 'all' && a.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const sName = siteMap.get(a.site_id)?.name.toLowerCase() || '';
        const desc = (a.description || '').toLowerCase();
        const assignee = (a.assignee || '').toLowerCase();
        if (!sName.includes(q) && !desc.includes(q) && !assignee.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [actions, siteFilter, severityFilter, statusFilter, searchQuery, siteMap]);

  const handleUpdateAction = async (
    action: CorrectiveAction,
    patch: Partial<{
      status: ActionStatus;
      assignee: string | null;
      due_date: string | null;
      severity: SeverityLevel | null;
      description: string;
    }>
  ) => {
    if (!canEdit) return;
    setUpdatingId(action.id);
    try {
      await repository.updateCorrectiveAction(action.id, patch);
      onRefresh();
      onShowToast('Đã cập nhật việc khắc phục lỗi');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi cập nhật việc khắc phục.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openCreateDialog = () => {
    setFormSiteId(siteFilter !== 'all' ? siteFilter : sites[0]?.id || '');
    setFormDescription('');
    setFormSeverity('nghiem_trong');
    setFormAssignee('');
    setFormDueDate('');
    setFormStatus('open');
    setShowCreateModal(true);
  };

  const openEditDialog = (act: CorrectiveAction) => {
    setEditingAction(act);
    setFormSiteId(act.site_id);
    setFormDescription(act.description);
    setFormSeverity(act.severity || 'nghiem_trong');
    setFormAssignee(act.assignee || '');
    setFormDueDate(act.due_date ? act.due_date.slice(0, 10) : '');
    setFormStatus(act.status);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !formDescription.trim()) return;
    try {
      if (editingAction) {
        await repository.updateCorrectiveAction(editingAction.id, {
          description: formDescription.trim(),
          severity: formSeverity,
          assignee: formAssignee.trim() || null,
          due_date: formDueDate || null,
          status: formStatus,
        });
        setEditingAction(null);
        onShowToast('Đã lưu chỉnh sửa việc khắc phục lỗi');
      } else {
        await repository.createCorrectiveAction({
          site_id: formSiteId || sites[0]?.id || '',
          description: formDescription.trim(),
          severity: formSeverity,
          assignee: formAssignee.trim() || null,
          due_date: formDueDate || null,
        });
        setShowCreateModal(false);
        onShowToast('Đã thêm việc khắc phục lỗi mới');
      }
      onRefresh();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Không thể lưu việc khắc phục.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteAction || !canEdit) return;
    try {
      await repository.deleteCorrectiveAction(confirmDeleteAction.id);
      setConfirmDeleteAction(null);
      onRefresh();
      onShowToast('Đã xóa việc khắc phục lỗi');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Không thể xóa việc khắc phục.');
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Filter Bar */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">Danh Sách Lỗi Cần Khắc Phục</h2>
            <p className="text-xs text-white/85">
              Hệ thống tự động mở lỗi khi chấm Không đạt và cho phép Quản trị viên thêm, sửa, xóa trực tiếp.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Segmented Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-white/25 border border-white/55 backdrop-blur-md">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'open', label: 'Mở' },
                { id: 'in_progress', label: 'Đang xử lý' },
                { id: 'overdue', label: 'Quá hạn' },
                { id: 'closed', label: 'Đã đóng' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'btn-accent text-white shadow'
                      : 'text-white/95 hover:bg-white/35'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={openCreateDialog}
                className="min-h-[42px] px-4 rounded-xl btn-accent text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm việc khắc phục</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-white/90 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nội dung lỗi, người phụ trách..."
              className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl glass-tool text-white placeholder:text-white/80 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="min-h-[46px] px-3.5 rounded-xl glass-tool text-white text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">Tất cả điểm rửa xe</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
            className="min-h-[46px] px-3.5 rounded-xl glass-tool text-white text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">Tất cả mức độ</option>
            <option value="nguy_co_cao">Nguy cơ cao</option>
            <option value="nghiem_trong">Nghiêm trọng</option>
            <option value="nhe">Nhẹ</option>
          </select>
        </div>
      </div>

      {/* Actions List */}
      {filteredActions.length === 0 ? (
        <div className="glass-card rounded-3xl p-8 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-base font-bold">Không có lỗi nào khớp bộ lọc hiện tại</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Mọi hạng mục tại điểm rửa xe đang được kiểm soát tốt.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredActions.map((act) => {
            const site = siteMap.get(act.site_id);
            const overdue = isActionOverdue(act);
            const daysLate = overdue ? getDaysLate(act) : 0;

            return (
              <div
                key={act.id}
                className={`glass-card rounded-3xl p-4 sm:p-5 space-y-3 ${
                  overdue ? 'ring-1 ring-rose-500/60 glow-fail' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-teal-700 dark:text-teal-300">
                        {site?.name || 'Điểm rửa xe'}
                      </span>
                      <span>·</span>
                      <span
                        className={`font-bold ${
                          act.severity === 'nguy_co_cao' || act.severity === 'nghiem_trong'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        Mức độ: {act.severity ? SEVERITY_LABELS[act.severity] : 'Nghiêm trọng'}
                      </span>
                      <span>·</span>
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">
                        Trạng thái: {ACTION_STATUS_LABELS[act.status]}
                      </span>
                      {overdue && (
                        <>
                          <span>·</span>
                          <span className="text-rose-600 dark:text-rose-400 font-bold animate-pulse-soft flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Quá hạn {daysLate} ngày
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      {act.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      Tạo: {new Date(act.created_at).toLocaleDateString('vi-VN')}
                    </span>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditDialog(act)}
                          className="min-h-[36px] px-2.5 rounded-xl bg-white/45 hover:bg-white/70 border border-white/60 text-xs font-bold flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAction(act)}
                          className="min-h-[36px] px-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-700 text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-300/40 dark:border-white/15">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      <UserCheck className="w-3.5 h-3.5 inline mr-1" />
                      Giao người phụ trách
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit || updatingId === act.id}
                      defaultValue={act.assignee || ''}
                      onBlur={(e) => {
                        if (e.target.value !== (act.assignee || '')) {
                          handleUpdateAction(act, { assignee: e.target.value.trim() || null });
                        }
                      }}
                      placeholder="Nhập người phụ trách..."
                      className="w-full min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-xs sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      <Calendar className="w-3.5 h-3.5 inline mr-1" />
                      Hạn hoàn thành
                    </label>
                    <input
                      type="date"
                      disabled={!canEdit || updatingId === act.id}
                      value={act.due_date ? act.due_date.slice(0, 10) : ''}
                      onChange={(e) =>
                        handleUpdateAction(act, { due_date: e.target.value || null })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-xs sm:text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      <Clock className="w-3.5 h-3.5 inline mr-1" />
                      Đổi trạng thái xử lý
                    </label>
                    <div className="flex items-center gap-1.5">
                      {(['open', 'in_progress', 'closed'] as ActionStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={!canEdit || updatingId === act.id}
                          onClick={() => handleUpdateAction(act, { status: st })}
                          className={`flex-1 min-h-[44px] rounded-xl text-xs font-bold transition ${
                            act.status === st
                              ? st === 'closed'
                                ? 'bg-emerald-600 text-white'
                                : st === 'in_progress'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-rose-600 text-white'
                              : 'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {ACTION_STATUS_LABELS[st]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Adding or Editing Corrective Action */}
      {(showCreateModal || editingAction) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
          <form
            onSubmit={handleSaveModal}
            className="glass-panel max-w-lg w-full rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-300/40">
              <h3 className="text-base sm:text-lg font-bold">
                {editingAction ? 'Chỉnh sửa việc khắc phục lỗi' : 'Thêm việc khắc phục lỗi mới'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingAction(null);
                }}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-white/30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {!editingAction && (
                <div>
                  <label className="block text-xs font-bold mb-1">Điểm rửa xe</label>
                  <select
                    value={formSiteId}
                    onChange={(e) => setFormSiteId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white/85 border border-slate-300 text-sm font-semibold"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold mb-1">Nội dung lỗi cần khắc phục</label>
                <textarea
                  rows={3}
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Mô tả chi tiết lỗi và biện pháp khắc phục..."
                  className="w-full p-3 rounded-xl bg-white/85 border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Mức độ lỗi</label>
                  <select
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value as SeverityLevel)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white/85 border border-slate-300 text-sm"
                  >
                    <option value="nguy_co_cao">Nguy cơ cao</option>
                    <option value="nghiem_trong">Nghiêm trọng</option>
                    <option value="nhe">Nhẹ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Trạng thái</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ActionStatus)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white/85 border border-slate-300 text-sm"
                  >
                    <option value="open">Mở</option>
                    <option value="in_progress">Đang xử lý</option>
                    <option value="closed">Đã đóng</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Người phụ trách</label>
                  <input
                    type="text"
                    value={formAssignee}
                    onChange={(e) => setFormAssignee(e.target.value)}
                    placeholder="Tên người phụ trách..."
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white/85 border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Hạn hoàn thành</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white/85 border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingAction(null);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-slate-200/80 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl btn-accent text-xs font-bold"
              >
                Lưu thông tin
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Modal for Deleting Action */}
      {confirmDeleteAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
          <div className="glass-panel max-w-sm w-full rounded-3xl p-6 space-y-4">
            <h4 className="text-base font-bold text-rose-600">Xác nhận xóa việc khắc phục?</h4>
            <p className="text-xs">
              Nội dung &ldquo;{confirmDeleteAction.description}&rdquo; sẽ bị xóa khỏi danh sách khắc phục.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAction(null)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-200/80 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
