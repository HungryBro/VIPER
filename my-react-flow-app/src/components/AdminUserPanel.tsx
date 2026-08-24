import { useCallback, useEffect, useState } from 'react';

import {
  listAdminUsers,
  updateAdminUser,
  type AdminUser,
  type AdminUserUpdate,
} from '../lib/adminApi';


type AdminUserPanelProps = {
  open: boolean;
  currentUserId: number;
  onClose: () => void;
};


function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}


export default function AdminUserPanel({
  open,
  currentUserId,
  onClose,
}: AdminUserPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listAdminUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadUsers();
  }, [open, loadUsers]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  const applyUpdate = async (user: AdminUser, update: AdminUserUpdate) => {
    setUpdatingId(user.id);
    setError(null);
    try {
      const updated = await updateAdminUser(user.id, update);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user.');
    } finally {
      setUpdatingId(null);
    }
  };

  const banForHours = (user: AdminUser, hours: number) => {
    const bannedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    void applyUpdate(user, { status: 'banned', banned_until: bannedUntil });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-users-title">
      <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h2 id="admin-users-title" className="text-lg font-black text-teal-300">User Account Control</h2>
            <p className="text-xs text-slate-400">Change roles or temporarily suspend platform access.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close user account control">✕</button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="overflow-auto p-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading users…</div>
          ) : (
            <table className="w-full min-w-[780px] border-separate border-spacing-y-2 text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3">User</th>
                  <th className="px-3">Role</th>
                  <th className="px-3">Status</th>
                  <th className="px-3">Last login</th>
                  <th className="px-3 text-right">Access control</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => {
                  const isSelf = item.id === currentUserId;
                  const isUpdating = item.id === updatingId;
                  return (
                    <tr key={item.id} className="bg-slate-800/70 text-slate-200">
                      <td className="rounded-l-lg px-3 py-3">
                        <div className="font-semibold">{item.display_name}{isSelf ? ' (you)' : ''}</div>
                        <div className="text-[10px] text-slate-500">{item.email}</div>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={item.role}
                          disabled={isSelf || isUpdating}
                          onChange={(event) => void applyUpdate(item, { role: event.target.value as 'admin' | 'user' })}
                          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Role for ${item.email}`}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.status === 'banned' ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                          {item.status}
                        </span>
                        {item.status === 'banned' && (
                          <div className="mt-1 text-[9px] text-slate-500">until {formatDate(item.banned_until)}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-400">{formatDate(item.last_login_at)}</td>
                      <td className="rounded-r-lg px-3 py-3">
                        <div className="flex justify-end gap-1">
                          {item.status === 'banned' ? (
                            <button
                              type="button"
                              disabled={isSelf || isUpdating}
                              onClick={() => void applyUpdate(item, { status: 'active' })}
                              className="rounded border border-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                            >
                              UNBAN
                            </button>
                          ) : (
                            <>
                              {[1, 24, 168].map((hours) => (
                                <button
                                  key={hours}
                                  type="button"
                                  disabled={isSelf || isUpdating}
                                  onClick={() => banForHours(item, hours)}
                                  className="rounded border border-red-500/30 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                >
                                  BAN {hours === 168 ? '7D' : `${hours}H`}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-700 px-5 py-3">
          <button type="button" onClick={() => void loadUsers()} disabled={loading} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            REFRESH
          </button>
        </div>
      </div>
    </div>
  );
}
