// ที่หมายหลัง login (`next`) ต้องเป็น path ภายในแอปเท่านั้น กัน open redirect
// รับเฉพาะ: ขึ้นต้นด้วย "/" ตัวเดียว (ไม่ใช่ "//" หรือ "/\"), ไม่มี scheme, ไม่มี control character,
// และ new URL(next, origin).origin ต้องเท่า origin ของแอป ค่าที่ไม่ผ่านใช้ "/" แทน
export const FALLBACK_NEXT = '/';

const MAX_LENGTH = 2048;
// control character (รวม \t \n \r), DEL และ backslash (บาง browser ตีความ "\" เป็น "/")
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\\]/;

function decodesToUnsafePrefix(value: string): boolean {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith('//') || decoded.startsWith('/\\') || FORBIDDEN_CHARS.test(decoded);
  } catch {
    return true;
  }
}

export function safeNext(raw: unknown, origin: string = window.location.origin): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return FALLBACK_NEXT;
  if (raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return FALLBACK_NEXT;
  if (FORBIDDEN_CHARS.test(raw) || decodesToUnsafePrefix(raw)) return FALLBACK_NEXT;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return FALLBACK_NEXT;
    // กันวนกลับหน้า login
    if (url.pathname === '/login') return FALLBACK_NEXT;
  } catch {
    return FALLBACK_NEXT;
  }
  return raw;
}

// Google OAuth redirect กลับ "/" เสมอ จึงเก็บ next ไว้ใน sessionStorage (ต่อแท็บ) ก่อนไปหน้า Google
const STORAGE_KEY = 'viper.platform.next';
const MAX_AGE_MS = 10 * 60 * 1000;

export function rememberNext(next: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ next: safeNext(next), at: Date.now() }));
  } catch {
    // sessionStorage ใช้ไม่ได้: login ได้ตามปกติ แต่จะกลับหน้าแรก
  }
}

// อ่านแล้วลบทันที คืน null ถ้าไม่มี หมดอายุ หรือไม่ผ่านการตรวจ
export function takeNext(now: number = Date.now()): string | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { next?: unknown; at?: unknown };
    if (typeof parsed.at !== 'number' || now - parsed.at > MAX_AGE_MS) return null;
    const next = safeNext(parsed.next);
    return next === FALLBACK_NEXT ? null : next;
  } catch {
    return null;
  }
}

export function hasPendingNext(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export const loginPathFor = (target: string): string =>
  target === FALLBACK_NEXT ? '/login' : `/login?next=${encodeURIComponent(target)}`;
