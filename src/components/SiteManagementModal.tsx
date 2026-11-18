import React, { useState } from 'react';
import { MapPin, Plus, Edit3, EyeOff, Eye, X, Copy, Trash2 } from 'lucide-react';
import { repository } from '../lib/repository';
import { Site, SiteType, SITE_TYPE_LABELS, UserRole } from '../types/database';

interface SiteManagementModalProps {
  sites: Site[];
  userRole: UserRole;
  onClose: () => void;
  onSaved: () => void;
  onManageItems?: (site: Site) => void;
  initialEditSite?: Site | null;
}

export const SiteManagementModal: React.FC<SiteManagementModalProps> = ({
  sites,
  userRole,
  onClose,
  onSaved,
  onManageItems,
  initialEditSite = null,
}) => {
  const canEdit = userRole === 'admin';
  const [editingSite, setEditingSite] = useState<Site | null>(initialEditSite);
  const [showForm, setShowForm] = useState<boolean>(!!initialEditSite || sites.length === 0);
  const [confirmDeleteSiteId, setConfirmDeleteSiteId] = useState<string | null>(null);

  const [name, setName] = useState(initialEditSite?.name || '');
  const [siteType, setSiteType] = useState<SiteType>(initialEditSite?.site_type || 'trai_heo');
  const [address, setAddress] = useState(initialEditSite?.address || '');
  const [lat, setLat] = useState<string>(
    initialEditSite?.lat !== null && initialEditSite?.lat !== undefined
      ? String(initialEditSite.lat)
      : ''
  );
  const [lng, setLng] = useState<string>(
    initialEditSite?.lng !== null && initialEditSite?.lng !== undefined
      ? String(initialEditSite.lng)
      : ''
  );
  const [managerName, setManagerName] = useState(initialEditSite?.manager_name || '');
  const [managerPhone, setManagerPhone] = useState(initialEditSite?.manager_phone || '');
  const [cycleDays, setCycleDays] = useState<string>(
    String(initialEditSite?.inspect_cycle_days || 7)
  );
  const [copyFromSiteId, setCopyFromSiteId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [gettingGps, setGettingGps] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCreateForm = () => {
    setEditingSite(null);
    setName('');
    setSiteType('trai_heo');
    setAddress('');
    setLat('');
    setLng('');
    setManagerName('');
    setManagerPhone('');
    setCycleDays('7');
    setCopyFromSiteId('');
    setErrorMsg(null);
    setShowForm(true);
  };

  const openEditForm = (s: Site) => {
    setEditingSite(s);
    setName(s.name);
    setSiteType(s.site_type);
    setAddress(s.address || '');
    setLat(s.lat !== null ? String(s.lat) : '');
    setLng(s.lng !== null ? String(s.lng) : '');
    setManagerName(s.manager_name || '');
    setManagerPhone(s.manager_phone || '');
    setCycleDays(String(s.inspect_cycle_days || 7));
    setErrorMsg(null);
    setShowForm(true);
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Thiết bị không hỗ trợ định vị GPS.');
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGettingGps(false);
      },
      () => {
        setErrorMsg('Không thể lấy tọa độ GPS. Hãy kiểm tra quyền truy cập vị trí.');
        setGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập tên điểm rửa xe.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = {
        name: name.trim(),
        site_type: siteType,
        address: address.trim() || null,
        lat: lat.trim() ? Number(lat) : null,
        lng: lng.trim() ? Number(lng) : null,
        manager_name: managerName.trim() || null,
        manager_phone: managerPhone.trim() || null,
        inspect_cycle_days: Math.max(1, parseInt(cycleDays, 10) || 7),
        is_active: editingSite ? editingSite.is_active : true,
      };

      if (editingSite) {
        await repository.updateSite(editingSite.id, payload);
      } else {
        await repository.createSite(payload, copyFromSiteId || null);
      }
      onSaved();
      setShowForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi lưu điểm rửa xe.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (site: Site) => {
    if (!canEdit) return;
    try {
      await repository.updateSite(site.id, { is_active: !site.is_active });
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đổi trạng thái điểm.');
    }
  };

  const handleDeleteSite = async (siteId: string) => {
    if (!canEdit) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await repository.deleteSite(siteId);
      setConfirmDeleteSiteId(null);
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa điểm rửa xe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-3 sm:p-6 overflow-y-auto">
      <div className="glass-panel w-full max-w-3xl rounded-3xl p-5 sm:p-7 text-slate-900 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-white/60">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Quản lý Điểm Rửa Xe Sát Khuẩn
            </h2>
            <p className="text-xs text-slate-700">
              Khi tạo điểm mới, hệ thống tự động khởi tạo khung tiêu đề lớn và hạng mục mẫu chuẩn (Admin có thể tùy chỉnh riêng cho từng điểm).
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

        {errorMsg && (
          <div className="mt-3 rounded-xl bg-rose-500/15 border border-rose-400/50 p-3 text-xs font-semibold text-rose-700">
            {errorMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {showForm ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">Tên điểm rửa xe *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VD: Trạm Rửa Xe Trại Heo Bình Phước 1"
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Loại điểm *</label>
                  <select
                    value={siteType}
                    onChange={(e) => setSiteType(e.target.value as SiteType)}
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {(Object.keys(SITE_TYPE_LABELS) as SiteType[]).map((k) => (
                      <option key={k} value={k}>
                        {SITE_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Địa chỉ hiện trường</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Nhập địa chỉ xã/huyện/tỉnh"
                  className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Người phụ trách</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="Họ và tên"
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    value={managerPhone}
                    onChange={(e) => setManagerPhone(e.target.value)}
                    placeholder="09xx..."
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Chu kỳ kiểm tra (ngày)</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={cycleDays}
                    onChange={(e) => setCycleDays(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold mb-1">Vĩ độ (Lat)</label>
                  <input
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="10.762622"
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Kinh độ (Lng)</label>
                  <input
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="106.660172"
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  disabled={gettingGps}
                  className="min-h-[48px] px-4 rounded-xl glass-tool text-sky-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-white/80 transition"
                >
                  <MapPin className="w-4 h-4" />
                  <span>{gettingGps ? 'Đang lấy tọa độ...' : 'Lấy GPS hiện tại'}</span>
                </button>
              </div>

              {!editingSite && (
                <div>
                  <label className="block text-xs font-bold mb-1">Bộ hạng mục khởi tạo</label>
                  <select
                    value={copyFromSiteId}
                    onChange={(e) => setCopyFromSiteId(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 rounded-xl glass-tool text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">
                      Khởi tạo từ khung mẫu chuẩn An Toàn Sinh Học
                    </option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        Sao chép tiêu đề & hạng mục từ điểm: {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="min-h-[48px] px-5 rounded-xl glass-tool text-sm font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving || !canEdit}
                  className="min-h-[48px] px-6 rounded-xl btn-accent text-white text-sm font-bold disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : editingSite ? 'Cập nhật điểm' : 'Tạo điểm mới'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {canEdit && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="min-h-[48px] px-4 rounded-xl btn-accent text-white text-sm font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm điểm rửa xe mới</span>
                  </button>
                </div>
              )}

              {sites.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-700">
                  Chưa có điểm rửa xe nào trong hệ thống.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sites.map((s) => (
                    <div
                      key={s.id}
                      className={`glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !s.is_active ? 'opacity-65' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm sm:text-base text-slate-900">
                            {s.name}
                          </span>
                          <span className="text-xs font-semibold text-sky-700">
                            · {SITE_TYPE_LABELS[s.site_type]}
                          </span>
                          {!s.is_active && (
                            <span className="text-xs font-bold text-amber-600">· Đã ẩn</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700">
                          {s.address || 'Chưa cập nhật địa chỉ'} · Phụ trách: {s.manager_name || '—'} (
                          {s.manager_phone || '—'}) · Chu kỳ: {s.inspect_cycle_days} ngày
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onManageItems && (
                          <button
                            type="button"
                            onClick={() => onManageItems(s)}
                            className="min-h-[44px] px-3 rounded-xl glass-tool text-sky-700 text-xs font-bold flex items-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Hạng mục</span>
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(s)}
                              className="min-h-[44px] px-3 rounded-xl glass-tool text-xs font-bold flex items-center gap-1.5"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Sửa</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(s)}
                              className="min-h-[44px] px-3 rounded-xl glass-tool text-xs font-bold flex items-center gap-1.5"
                            >
                              {s.is_active ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>Ẩn</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Hiện</span>
                                </>
                              )}
                            </button>
                            {confirmDeleteSiteId === s.id ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteSite(s.id)}
                                disabled={saving}
                                className="min-h-[44px] px-3 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5"
                              >
                                <span>Xác nhận xóa</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSiteId(s.id)}
                                className="min-h-[44px] px-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-700 text-xs font-bold flex items-center gap-1"
                                title="Xóa điểm rửa xe"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
