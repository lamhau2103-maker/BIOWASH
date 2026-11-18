import React, { useEffect, useRef, useState } from 'react';
import { Download, Eraser, Check, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

// 1. Animated Counter for Realtime Numbers
export const AnimatedCounter: React.FC<{
  value: number;
  suffix?: string;
  decimals?: number;
  className?: string;
}> = ({ value, suffix = '', decimals = 0, className = '' }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const startVal = prevValueRef.current;
    const endVal = value;
    prevValueRef.current = value;

    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    const duration = 450;
    const startTime = performance.now();
    let rafId: number;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * eased;
      setDisplayValue(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return (
    <span className={`tabular-nums ${className}`}>
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  );
};

// 2. Circular Glass Progress Gauge
export const CircularGauge: React.FC<{
  percentage: number;
  size?: number;
  strokeWidth?: number;
  thresholdGood?: number;
  thresholdWarn?: number;
  label?: string;
  sublabel?: string;
}> = ({
  percentage,
  size = 84,
  strokeWidth = 8,
  thresholdGood = 90,
  thresholdWarn = 75,
  label,
  sublabel,
}) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const colorId =
    clamped >= thresholdGood
      ? 'gauge-grad-good'
      : clamped >= thresholdWarn
      ? 'gauge-grad-warn'
      : 'gauge-grad-fail';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 transform">
        <defs>
          <linearGradient id="gauge-grad-good" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
          <linearGradient id="gauge-grad-warn" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="gauge-grad-fail" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-300/40 dark:text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={`url(#${colorId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
          {label ?? `${Math.round(clamped)}%`}
        </span>
        {sublabel && (
          <span className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">{sublabel}</span>
        )}
      </div>
    </div>
  );
};

// 3. Hand-Drawn Signature Canvas Pad
export const SignaturePad: React.FC<{
  label: string;
  existingUrl?: string | null;
  onSaveBlob: (blob: Blob) => Promise<void>;
  disabled?: boolean;
}> = ({ label, existingUrl, onSaveBlob, disabled = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasStroke(true);
  };

  const moveDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleConfirmSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (blob) {
        await onSaveBlob(blob);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
        {existingUrl && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Đã lưu chữ ký
          </span>
        )}
      </div>

      {existingUrl && !hasStroke ? (
        <div className="relative rounded-xl bg-white/90 p-2 border border-teal-500/20 flex flex-col items-center">
          <img
            src={existingUrl}
            alt={label}
            referrerPolicy="no-referrer"
            className="max-h-28 object-contain"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => setHasStroke(true)}
              className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-600 underline min-h-[36px] px-3"
            >
              Ký lại chữ ký mới
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-white/95 border border-slate-300 dark:border-white/20 overflow-hidden touch-none">
            <canvas
              ref={canvasRef}
              width={480}
              height={160}
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
              className="w-full h-36 cursor-crosshair"
            />
          </div>
          {!disabled && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={clearCanvas}
                className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200/70 dark:bg-white/10 hover:bg-slate-300/70 transition flex items-center gap-1.5"
              >
                <Eraser className="w-4 h-4" />
                Xóa ký lại
              </button>
              <button
                type="button"
                disabled={!hasStroke || saving}
                onClick={handleConfirmSignature}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-40 transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Đang tải lên...' : 'Xác nhận chữ ký'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// 4. PWA Install Button Component
export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:scale-95 text-white font-semibold transition whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
        }`}
      >
        <Download className="w-4 h-4" />
        <span>Cài đặt ứng dụng</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-teal-600/90 hover:bg-teal-500 text-white font-semibold transition whitespace-nowrap shrink-0 ${
            compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Cài trên iPhone/iPad</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop p-4">
            <div className="glass-panel w-full max-w-sm rounded-3xl p-6 space-y-4 text-slate-900">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Cài đặt BIO-WASH CHECK trên iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="text-sm space-y-2 text-slate-700 dark:text-slate-200 list-decimal list-inside">
                <li>Nhấn biểu tượng <strong>Chia sẻ (Share)</strong> ở thanh công cụ Safari.</li>
                <li>Cuộn xuống và chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.</li>
                <li>Nhấn <strong>Thêm (Add)</strong> ở góc trên bên phải.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[48px] rounded-xl bg-teal-600 text-white font-semibold text-sm"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

// 5. Glass Skeleton Loader
export const GlassSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="glass-card rounded-3xl p-5 space-y-3 animate-pulse">
          <div className="h-4 w-1/3 rounded-lg bg-slate-300/60 dark:bg-white/15" />
          <div className="h-8 w-1/2 rounded-lg bg-slate-300/60 dark:bg-white/15" />
          <div className="h-3 w-2/3 rounded-lg bg-slate-300/60 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
};
