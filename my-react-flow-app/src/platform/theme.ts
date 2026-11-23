// ธีมสว่าง/มืดของแพลตฟอร์ม: ค่าเก็บใน localStorage แล้วสลับด้วย attribute data-theme บน .viper-platform
// (ใช้ key ใหม่ ไม่ใช้ key ของ mockup หรือ n2n_*)
import { useCallback, useSyncExternalStore } from 'react';

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

// ค่าธีมเก็บที่ระดับ module ให้ทุกที่ที่เรียก usePlatformTheme (Layout, header บน /lab ใน LabHost, dialog ของ Lab)
// อ่านค่าเดียวกัน: สลับที่หน้าไหนก็ตามกันทันทีโดยไม่ต้อง reload (C1) LabHost ค้าง mount อยู่ตลอดจึงต้องฟังการเปลี่ยน
let currentTheme: PlatformTheme | null = null;
const themeListeners = new Set<() => void>();

function getTheme(): PlatformTheme {
  if (currentTheme === null) currentTheme = readStoredTheme();
  return currentTheme;
}

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function toggleTheme(): void {
  const next: PlatformTheme = getTheme() === 'dark' ? 'light' : 'dark';
  currentTheme = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // เก็บไม่ได้ก็ใช้ได้เฉพาะรอบนี้
  }
  themeListeners.forEach((listener) => listener());
}

export function usePlatformTheme(): [PlatformTheme, () => void] {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const toggle = useCallback(() => toggleTheme(), []);
  return [theme, toggle];
}
