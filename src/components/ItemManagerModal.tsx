import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit3,
  EyeOff,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { repository } from '../lib/repository';
import { CHECKLIST_GROUPS, ChecklistItem, Site, UserRole } from '../types/database';

interface ItemManagerModalProps {
  site: Site;
  allSites: Site[];
  items: ChecklistItem[];
  userRole: UserRole;
  onClose: () => void;
  onChanged: () => void;
}

export const ItemManagerModal: React.FC<ItemManagerModalProps> = ({
  site,
  allSites,
  items,
  userRole,
  onClose,
  onChanged,
}) => {
  const canEdit = userRole === 'admin' || userRole === 'inspector';
  const siteItems = items
    .filter((i) => i.site_id === site.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  const activeItems = siteItems.filter((i) => i.is_active);
  const hiddenItems = siteItems.filter((i) => !i.is_active);

  const [newTitle, setNewTitle] = useState('');
  const [newGroup, setNewGroup] = useState<string>(CHECKLIST_GROUPS[0]);
  const [newCritical, setNewCritical] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [confirmHideItem, setConfirmHideItem] = useState<ChecklistItem | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ChecklistItem | null>(null);
  const [showHiddenSection, setShowHiddenSection] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleAddOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newTitle.trim()) return;
    setBusy(true);
    setErrMsg(null);
    try {
      if (editingItem) {
        await repository.updateChecklistItem(editingItem.id, {
          title: newTitle.trim(),
          group_name: newGroup,
          is_critical: newCritical,
        });
        setEditingItem(null);
      } else {
        const nextSort =
          siteItems.length > 0 ? Math.max(...siteItems.map((i) => i.sort_order)) + 1 : 1;
        await repository.createChecklistItem({
          site_id: site.id,
          group_name: newGroup,
          title: newTitle.trim(),
          is_critical: newCritical,
          sort_order: nextSort,
        });
      }
      setNewTitle('');
      setNewCritical(false);
      onChanged();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Lỗi khi lưu hạng mục.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmHide = async () => {
    if (!confirmHideItem || !canEdit) return;
    setBusy(true);
    try {
      await repository.updateChecklistItem(confirmHideItem.id, { is_active: false });
      setConfirmHideItem(null);
      onChanged();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Không thể ẩn hạng mục.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteItem || !canEdit) return;
    setBusy(true);
    try {
      await repository.deleteChecklistItem(confirmDeleteItem.id);
      setConfirmDeleteItem(null);
      onChanged();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Không thể xóa hạng mục.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (item: ChecklistItem) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      await repository.updateChecklistItem(item.id, { is_active: true });
      onChanged();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Không thể khôi phục hạng mục.');
    } finally {
      setBusy(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: -1 | 1) => {
    if (!canEdit) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeItems.length) return;
    const itemA = activeItems[index];
    const itemB = activeItems[targetIdx];
    setBusy(true);
    try {
      await Promise.all([
        repository.updateChecklistItem(itemA.id, { sort_order: targetIdx + 1 }),
        repository.updateChecklistItem(itemB.id, { sort_order: index + 1 }),
      ]);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleDropReorder = async (dropIdx: number) => {
    if (draggedIndex === null || draggedIndex === dropIdx || !canEdit) {
      setDraggedIndex(null);
      return;
    }
    const reordered = [...activeItems];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIdx, 0, moved);
    setDraggedIndex(null);
    setBusy(true);
    try {
      await Promise.all(
        reordered.map((it, idx) => repository.updateChecklistItem(it.id, { sort_order: idx + 1 }))
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleCopyFromOtherSite = async () => {
    if (!canEdit) return;
    setBusy(true);
    setErrMsg(null);
    try {
      await repository.copyDefaultItemsToSite(site.id, copySourceId || undefined);
      onChanged();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Lỗi khi sao chép hạng mục.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-3 sm:p-6">
      <div className="glass-panel w-full max-w-4xl rounded-3xl p-5 sm:p-7 text-slate-900 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-white/60">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Quản lý Hạng Mục · {site.name}
            </h2>
            <p className="text-xs text-slate-700">
              Thêm, sửa, xóa hoặc kéo-thả đổi thứ tự hạng mục. Ẩn hạng mục sẽ giữ nguyên lịch sử kiểm tra trước đó.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center glass-tool hover:bg-white/80"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errMsg && (
          <div className="mt-3 rounded-xl bg-rose-500/15 border border-rose-400/50 p-3 text-xs font-semibold text-rose-700">
            {errMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {canEdit && (
            <form onSubmit={handleAddOrUpdate} className="glass-card rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-700">
                {editingItem ? 'Sửa hạng mục đang chọn' : 'Thêm hạng mục mới cho điểm này'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Nhóm hạng mục</label>
                  <select
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    className="w-full min-h-[46px] px-3 rounded-xl glass-tool text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {CHECKLIST_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-1">Tên hạng mục kiểm tra</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Nhập nội dung hạng mục kiểm tra..."
                    className="w-full min-h-[46px] px-3.5 rounded-xl glass-tool text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={newCritical}
                    onChange={(e) => setNewCritical(e.target.checked)}
                    className="w-4 h-4 accent-rose-600 rounded"
                  />
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span>Đánh dấu hạng mục NGHIÊM TRỌNG (Không đạt sẽ hạ bậc toàn điểm)</span>
                </label>
                <div className="flex items-center gap-2">
                  {editingItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setNewTitle('');
                        setNewCritical(false);
                      }}
                      className="min-h-[44px] px-3.5 rounded-xl glass-tool text-xs font-bold"
                    >
                      Hủy sửa
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={busy || !newTitle.trim()}
                    className="min-h-[44px] px-4 rounded-xl btn-accent text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingItem ? 'Lưu thay đổi' : 'Thêm hạng mục'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Copy from template or another site if needed */}
          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-2 glass-card rounded-2xl p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Copy className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Sao chép bổ sung hạng mục:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={copySourceId}
                  onChange={(e) => setCopySourceId(e.target.value)}
                  className="min-h-[42px] px-3 rounded-xl glass-tool text-xs font-semibold"
                >
                  <option value="">Mẫu chuẩn 6 nhóm (20 mục)</option>
                  {allSites
                    .filter((s) => s.id !== site.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Từ điểm: {s.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCopyFromOtherSite}
                  className="min-h-[42px] px-3.5 rounded-xl btn-accent text-white text-xs font-bold"
                >
                  Sao chép vào điểm này
                </button>
              </div>
            </div>
          )}

          {/* Active Items List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">
                Hạng mục đang áp dụng ({activeItems.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowHiddenSection((prev) => !prev)}
                className="min-h-[40px] px-3 rounded-xl text-xs font-bold text-sky-700 hover:underline"
              >
                {showHiddenSection
                  ? 'Ẩn danh sách đã ẩn'
                  : `Xem hạng mục đã ẩn (${hiddenItems.length})`}
              </button>
            </div>

            {activeItems.length === 0 ? (
              <div className="glass-card rounded-2xl p-6 text-center text-sm text-slate-700">
                Điểm này chưa có hạng mục nào. Nhấn &ldquo;Sao chép vào điểm này&rdquo; để khởi tạo bộ 20 hạng mục chuẩn.
              </div>
            ) : (
              <div className="space-y-2">
                {activeItems.map((it, idx) => (
                  <div
                    key={it.id}
                    draggable={canEdit}
                    onDragStart={() => setDraggedIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropReorder(idx)}
                    className="glass-card rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-move"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                        <span className="font-mono tabular-nums font-bold">#{idx + 1}</span>
                        <span>·</span>
                        <span>{it.group_name}</span>
                        {it.is_critical && (
                          <>
                            <span>·</span>
                            <span className="text-rose-600 font-bold">
                              NGHIÊM TRỌNG
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-900">
                        {it.title}
                      </p>
                    </div>

                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(idx, -1)}
                          disabled={idx === 0 || busy}
                          className="min-h-[42px] min-w-[42px] rounded-xl glass-tool flex items-center justify-center disabled:opacity-30"
                          title="Chuyển lên"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(idx, 1)}
                          disabled={idx === activeItems.length - 1 || busy}
                          className="min-h-[42px] min-w-[42px] rounded-xl glass-tool flex items-center justify-center disabled:opacity-30"
                          title="Chuyển xuống"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(it);
                            setNewTitle(it.title);
                            setNewGroup(it.group_name);
                            setNewCritical(it.is_critical);
                          }}
                          className="min-h-[42px] px-3 rounded-xl glass-tool text-xs font-bold flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmHideItem(it)}
                          className="min-h-[42px] px-3 rounded-xl bg-amber-500/20 text-amber-800 text-xs font-bold flex items-center gap-1"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Ẩn</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteItem(it)}
                          className="min-h-[42px] px-3 rounded-xl bg-rose-500/20 text-rose-700 text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hidden Items Section */}
          {showHiddenSection && (
            <div className="space-y-2 pt-3 border-t border-white/60">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Hạng mục đã ẩn ({hiddenItems.length})
              </h4>
              {hiddenItems.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Không có hạng mục nào đang ẩn.
                </p>
              ) : (
                hiddenItems.map((it) => (
                  <div
                    key={it.id}
                    className="glass-card rounded-2xl p-3.5 flex items-center justify-between gap-3 opacity-85"
                  >
                    <div>
                      <p className="text-xs text-slate-600">{it.group_name}</p>
                      <p className="text-sm font-semibold">{it.title}</p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRestore(it)}
                          className="min-h-[42px] px-3.5 rounded-xl btn-accent text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Khôi phục</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteItem(it)}
                          className="min-h-[42px] px-3 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Confirmation Modal for Hiding Item */}
        {confirmHideItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
            <div className="glass-panel max-w-sm w-full rounded-3xl p-6 space-y-4">
              <h4 className="text-base font-bold">Xác nhận ẩn hạng mục?</h4>
              <p className="text-xs text-slate-700">
                Hạng mục &ldquo;{confirmHideItem.title}&rdquo; sẽ được đặt trạng thái ẩn (is_active = false) và có thể khôi phục bất kỳ lúc nào.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmHideItem(null)}
                  className="min-h-[44px] px-4 rounded-xl glass-tool text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmHide}
                  className="min-h-[44px] px-4 rounded-xl bg-amber-600 text-white text-xs font-bold"
                >
                  Đồng ý ẩn
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal for Deleting Item */}
        {confirmDeleteItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
            <div className="glass-panel max-w-sm w-full rounded-3xl p-6 space-y-4">
              <h4 className="text-base font-bold text-rose-600">
                Xác nhận xóa vĩnh viễn hạng mục?
              </h4>
              <p className="text-xs text-slate-700">
                Hạng mục &ldquo;{confirmDeleteItem.title}&rdquo; sẽ bị xóa khỏi danh sách kiểm tra của điểm này.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteItem(null)}
                  className="min-h-[44px] px-4 rounded-xl glass-tool text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold"
                >
                  Xóa hạng mục
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
