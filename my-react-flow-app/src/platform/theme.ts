// ธีมสว่าง/มืดของแพลตฟอร์ม: ค่าเก็บใน localStorage แล้วสลับด้วย attribute data-theme บน .viper-platform
// (ใช้ key ใหม่ ไม่ใช้ key ของ mockup หรือ n2n_*)
import { useCallback, useState } from 'react';

export type PlatformTheme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'viper.platform.theme';

export function readStoredTheme(): PlatformTheme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage ใช้ไม่ได้ (โหมดส่วนตัว/ถูกบล็อก) ใช้ค่าตามระบบ
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function usePlatformTheme(): [PlatformTheme, () => void] {
  const [theme, setTheme] = useState<PlatformTheme>(readStoredTheme);
  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: PlatformTheme = previous === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // เก็บไม่ได้ก็ใช้ได้เฉพาะรอบนี้
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}
