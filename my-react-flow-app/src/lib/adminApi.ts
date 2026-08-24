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
};


async function responseDetail(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.detail || `Request failed (${response.status})`;
}


export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await apiFetch('/api/admin/users');
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
