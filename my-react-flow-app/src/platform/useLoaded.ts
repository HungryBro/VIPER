// โหลดข้อมูลครั้งเดียวตอน mount สำหรับหน้า Profile และ Dashboard (T16, T17): { data, error, loading }
// load อ่านผ่าน ref จึงไม่ต้อง memoize ที่ผู้เรียก; fallback คือข้อความเมื่อ error ไม่ใช่ Error
import { useEffect, useRef, useState } from 'react';

export const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

export function useLoaded<T>(load: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let active = true;
    loadRef
      .current()
      .then((value) => active && setData(value))
      .catch((failure) => active && setError(errorText(failure, fallback)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fallback]);
  return { data, error, loading };
}

// ค่าที่ยังโหลดไม่เสร็จหรือโหลดไม่สำเร็จแสดงเป็น "–" ไม่ใช่ 0 กันเข้าใจผิดว่าเป็นข้อมูลจริง
export const num = (value: number | null | undefined): string => (value === null || value === undefined ? '–' : String(value));
