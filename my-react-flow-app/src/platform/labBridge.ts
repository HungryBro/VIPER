// สะพานส่ง template จากหน้า Templates ไป editor ของ /lab (T13)
// LabPage อาจยังไม่ mount (ผู้ใช้ยังไม่เคยเปิด /lab) หรือ mount ค้างอยู่แต่ซ่อน จึงเก็บเป็น module store
// แล้วให้ LabPage อ่านด้วย useSyncExternalStore: take() ล้างค่าทันทีที่อ่าน จึงเปิดแท็บเดียวแม้ StrictMode เรียก effect ซ้ำ
import type { TemplateDetail } from '../lib/templateApi';

let pending: TemplateDetail | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const labBridge = {
  push(template: TemplateDetail): void {
    pending = template;
    emit();
  },
  take(): TemplateDetail | null {
    const taken = pending;
    if (taken) {
      pending = null;
      emit();
    }
    return taken;
  },
  // ล้างค่าที่ค้าง (เช่น ตอน logout หรือเปลี่ยนบัญชี) ผู้ใช้คนถัดไปจะไม่ได้ template ของคนก่อน
  clear(): void {
    if (pending) {
      pending = null;
      emit();
    }
  },
  peek: (): TemplateDetail | null => pending,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
