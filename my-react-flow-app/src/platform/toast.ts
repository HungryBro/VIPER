// toast กลางของแพลตฟอร์ม: Layout เป็นผู้แสดง หน้าอื่นเรียก useToast() เพื่อแจ้งผล
import { createContext, useContext } from 'react';

export type Notify = (message: string) => void;

export const ToastContext = createContext<Notify>(() => {});

export const useToast = (): Notify => useContext(ToastContext);
