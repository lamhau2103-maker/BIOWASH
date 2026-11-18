import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://pxszekakdgboaqxljodo.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_O7VuVFD2y15P8WBw_SGG_Q_2odl_6lU';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL.trim() !== '')
    ? import.meta.env.VITE_SUPABASE_URL.trim()
    : DEFAULT_SUPABASE_URL;

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY && import.meta.env.VITE_SUPABASE_ANON_KEY.trim() !== '')
    ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
    : DEFAULT_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function translateSupabaseError(error: unknown): string {
  if (!error) return 'Đã xảy ra lỗi không xác định.';
  const errObj = error as { message?: string; code?: string; details?: string };
  const msg = (errObj.message || String(error)).toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
    return 'Tài khoản hoặc mật khẩu không đúng';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('fetch')) {
    return 'Không thể kết nối máy chủ. Dữ liệu sẽ được lưu tạm và đồng bộ khi có mạng.';
  }
  if (msg.includes('duplicate key') || errObj.code === '23505') {
    return 'Dữ liệu đã tồn tại hoặc bị trùng lặp.';
  }
  if (msg.includes('permission denied') || errObj.code === '42501' || msg.includes('row-level security')) {
    return 'Tài khoản của bạn không có quyền thực hiện thao tác này.';
  }
  if (msg.includes('foreign key') || errObj.code === '23503') {
    return 'Dữ liệu đang được liên kết với bản ghi khác, không thể xóa hoặc thay đổi.';
  }
  if (msg.includes('jwt expired') || msg.includes('refresh_token_not_found')) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  return errObj.message || 'Có lỗi xảy ra khi xử lý dữ liệu với hệ thống.';
}
