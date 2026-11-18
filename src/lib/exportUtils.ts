import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  CorrectiveAction,
  Inspection,
  InspectionResultRow,
  RESULT_LABELS,
  SEVERITY_LABELS,
  Site,
  SITE_TYPE_LABELS,
  VehicleWash,
} from '../types/database';

export function exportToCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((fieldName) => {
          const val = row[fieldName] === null || row[fieldName] === undefined ? '' : String(row[fieldName]);
          const escaped = val.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    ),
  ].join('\r\n');

  // Add UTF-8 BOM for Vietnamese characters in Excel
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportElementToPDF(elementId: string, filename: string): Promise<Blob | null> {
  const element = document.getElementById(elementId);
  if (!element) return null;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#0f172a',
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  const pageHeight = pdf.internal.pageSize.getHeight();

  let heightLeft = pdfHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - pdfHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`${filename}.pdf`);
  return pdf.output('blob');
}

export async function shareReport(title: string, text: string, url?: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url: url || window.location.href,
      });
      return true;
    } catch {
      return false;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(`${title}\n${text}\n${url || window.location.href}`);
    return true;
  }
  return false;
}

export function buildSiteHistoryCSVRows(
  site: Site | undefined,
  inspections: Inspection[],
  results: InspectionResultRow[],
  actions: CorrectiveAction[],
  washes: VehicleWash[]
) {
  const inspectionRows = inspections.map((ins) => {
    const insResults = results.filter((r) => r.inspection_id === ins.id);
    const passCount = insResults.filter((r) => r.status === 'pass').length;
    const failCount = insResults.filter((r) => r.status === 'fail').length;
    return {
      'Loại bản ghi': 'Kiểm tra điều kiện',
      'Điểm rửa xe': site ? site.name : ins.site_id,
      'Loại điểm': site ? SITE_TYPE_LABELS[site.site_type] : '',
      'Người kiểm tra': ins.inspector_name || '',
      'Thời gian bắt đầu': ins.started_at ? new Date(ins.started_at).toLocaleString('vi-VN') : '',
      'Thời gian hoàn tất': ins.finished_at ? new Date(ins.finished_at).toLocaleString('vi-VN') : '',
      'Điểm (%)': ins.score !== null ? Math.round(ins.score) : '',
      'Kết luận': ins.result ? RESULT_LABELS[ins.result] : 'Nháp',
      'Số mục Đạt': passCount,
      'Số mục Không đạt': failCount,
    };
  });

  const washRows = washes.map((w) => ({
    'Loại bản ghi': 'Rửa xe sát khuẩn',
    'Điểm rửa xe': site ? site.name : w.site_id,
    'Loại điểm': site ? SITE_TYPE_LABELS[site.site_type] : '',
    'Biển số xe': w.plate,
    'Loại xe': w.vehicle_type,
    'Tài xế': w.driver || '',
    'Nguồn gốc': w.origin || '',
    'Điểm đến': w.destination || '',
    'Thời gian bắt đầu': w.started_at ? new Date(w.started_at).toLocaleString('vi-VN') : '',
    'Thời gian hoàn tất': w.finished_at ? new Date(w.finished_at).toLocaleString('vi-VN') : '',
    'Kết luận': w.result === 'dat' ? 'ĐẠT' : w.result === 'khong_dat' ? 'KHÔNG ĐẠT' : 'Đang xử lý',
  }));

  const actionRows = actions.map((a) => ({
    'Loại bản ghi': 'Lỗi cần khắc phục',
    'Điểm rửa xe': site ? site.name : a.site_id,
    'Nội dung lỗi': a.description,
    'Mức độ': a.severity ? SEVERITY_LABELS[a.severity] : '',
    'Người phụ trách': a.assignee || '',
    'Hạn xử lý': a.due_date ? new Date(a.due_date).toLocaleDateString('vi-VN') : '',
    'Trạng thái': a.status === 'open' ? 'Mở' : a.status === 'in_progress' ? 'Đang xử lý' : 'Đã đóng',
  }));

  return [...inspectionRows, ...washRows, ...actionRows];
}
