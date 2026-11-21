import type { AuthUser } from '../auth/AuthContext';
import { apiFetch } from './http';


export type AdminUser = AuthUser & {
  provider: string;
  last_login_at: string | null;
  created_at: string;
};

export type AdminUserUpdate = {
  role?: 'admin' | 'user';
  status?: 'active' | 'banned';
  banned_until?: string | null;
  can_teach?: boolean;
};

// ตัวเลือกระยะเวลาแบน ใช้ร่วมกันระหว่าง AdminUserPanel (Lab) และหน้า Users ของแพลตฟอร์ม
export const banOptions = [
  { label: 'BAN 1M', durationMs: 60 * 1000 },
  { label: 'BAN 1H', durationMs: 60 * 60 * 1000 },
  { label: 'BAN 24H', durationMs: 24 * 60 * 60 * 1000 },
  { label: 'BAN 7D', durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type AdminAuditActor = {
  id: number;
  email: string;
  display_name: string;
};

export type AdminAuditLog = {
  id: number;
  actor_id: number | null;
  actor: AdminAuditActor | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  request_path: string | null;
  status_code: number | null;
  created_at: string;
};


async function responseDetail(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.detail || `Request failed (${response.status})`;
}


// ยอดรวมจาก header X-Total-Count ถ้าไม่มี header (เช่น proxy ตัดทิ้ง) Number(null) จะได้ 0 จึงต้องเช็กเอง
// ไม่มี header: นับเท่าที่โหลดมาแล้ว และถ้าหน้านี้เต็มให้ถือว่ายังมีหน้าถัดไป (+1) ปุ่ม "โหลดเพิ่ม" จะยังแสดง
function pageTotal(response: Response, offset: number, limit: number, received: number): number {
  const header = response.headers.get('X-Total-Count');
  const total = header === null || header.trim() === '' ? Number.NaN : Number(header);
  if (Number.isFinite(total) && total >= 0) return total;
  return offset + received + (received >= limit ? 1 : 0);
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await apiFetch('/api/admin/users');
  if (!response.ok) throw new Error(await responseDetail(response));
  return response.json();
}


export async function listAdminAuditLogs(limit = 200): Promise<AdminAuditLog[]> {
  const response = await apiFetch(`/api/admin/audit-logs?limit=${limit}`);
  if (!response.ok) throw new Error(await responseDetail(response));
  return response.json();
}


export type AdminAuditLogQuery = {
  limit?: number;
  offset?: number;
  action?: string[];
  actionPrefix?: string[];
  q?: string;
};

export type AdminAuditLogPage = {
  items: AdminAuditLog[];
  // จำนวนแถวที่ตรงตัวกรองทั้งหมด (header X-Total-Count) ไม่ใช่แค่หน้านี้
  total: number;
};

export type AdminAuditActionCount = {
  action: string;
  count: number;
};


export async function listAdminAuditLogPage(query: AdminAuditLogQuery = {}): Promise<AdminAuditLogPage> {
  const params = new URLSearchParams();
  params.set('limit', String(query.limit ?? 100));
  params.set('offset', String(query.offset ?? 0));
  query.action?.forEach((value) => params.append('action', value));
  query.actionPrefix?.forEach((value) => params.append('action_prefix', value));
  if (query.q?.trim()) params.set('q', query.q.trim());
  const response = await apiFetch(`/api/admin/audit-logs?${params.toString()}`);
  if (!response.ok) throw new Error(await responseDetail(response));
  const items: AdminAuditLog[] = await response.json();
  return { items, total: pageTotal(response, query.offset ?? 0, query.limit ?? 100, items.length) };
}


export async function listAdminAuditActions(): Promise<AdminAuditActionCount[]> {
  const response = await apiFetch('/api/admin/audit-logs/actions');
  if (!response.ok) throw new Error(await responseDetail(response));
  return response.json();
}


export async function updateAdminUser(
  userId: number,
  update: AdminUserUpdate,
): Promise<AdminUser> {
  const response = await apiFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(await responseDetail(response));
  return response.json();
}
