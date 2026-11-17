// ข้อมูลของผู้ใช้ที่ login อยู่เอง (T15: /api/me/*) server กรองด้วยผู้เรียกเสมอ ไม่ส่ง user id ไปจาก client
import { apiFetch } from './http';


export type MeActivity = {
  id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  // server คืนเฉพาะคีย์ที่อนุญาต: category, operation, method, duration_ms, success, visibility, is_official, template_id, provider
  details: Record<string, unknown>;
  request_path: string | null;
  status_code: number | null;
  created_at: string;
};

export type MeSummary = {
  // template ของฉันที่ไม่ถูกลบ (private + public)
  template_count: number;
  public_template_count: number;
  // audit processing.run ของฉัน (รวมที่ไม่สำเร็จ ดู details.success)
  run_count: number;
  // audit ทุกแถวที่ actor เป็นฉัน
  activity_count: number;
  last_run_at: string | null;
  last_activity_at: string | null;
  last_login_at: string | null;
  member_since: string;
};

export type MeActivityQuery = {
  limit?: number;
  offset?: number;
  action?: string[];
};

export type MeActivityPage = {
  items: MeActivity[];
  // จำนวนแถวที่ตรงตัวกรองทั้งหมด (header X-Total-Count)
  total: number;
};


async function responseDetail(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.detail || `Request failed (${response.status})`;
}


export async function getMySummary(): Promise<MeSummary> {
  const response = await apiFetch('/api/me/summary');
  if (!response.ok) throw new Error(await responseDetail(response));
  return response.json();
}


export async function listMyActivityPage(query: MeActivityQuery = {}): Promise<MeActivityPage> {
  const params = new URLSearchParams();
  params.set('limit', String(query.limit ?? 50));
  params.set('offset', String(query.offset ?? 0));
  query.action?.forEach((value) => params.append('action', value));
  const response = await apiFetch(`/api/me/activity?${params.toString()}`);
  if (!response.ok) throw new Error(await responseDetail(response));
  const items: MeActivity[] = await response.json();
  const total = Number(response.headers.get('X-Total-Count'));
  return { items, total: Number.isFinite(total) ? total : items.length };
}
