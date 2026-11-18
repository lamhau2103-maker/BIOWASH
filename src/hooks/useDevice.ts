import { useEffect, useState } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  deviceType: DeviceType;
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isPortrait: boolean;
  prefersReducedMotion: boolean;
}

function getDeviceType(width: number): DeviceType {
  if (width < 640) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

export function useDevice(): DeviceInfo {
  const [state, setState] = useState<DeviceInfo>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dt = getDeviceType(w);
    return {
      deviceType: dt,
      width: w,
      height: h,
      isMobile: dt === 'mobile',
      isTablet: dt === 'tablet',
      isDesktop: dt === 'desktop',
      isPortrait: h >= w,
      prefersReducedMotion: reduced,
    };
  });

  useEffect(() => {
    const updateDevice = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dt = getDeviceType(w);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setState({
        deviceType: dt,
        width: w,
        height: h,
        isMobile: dt === 'mobile',
        isTablet: dt === 'tablet',
        isDesktop: dt === 'desktop',
        isPortrait: h >= w,
        prefersReducedMotion: reduced,
      });
    };

    window.addEventListener('resize', updateDevice, { passive: true });
    window.addEventListener('orientationchange', updateDevice, { passive: true });
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener('change', updateDevice);

    return () => {
      window.removeEventListener('resize', updateDevice);
      window.removeEventListener('orientationchange', updateDevice);
      mediaQuery.removeEventListener('change', updateDevice);
    };
  }, []);

  return state;
}
