import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  listAdminUsers,
  updateAdminUser,
  type AdminUser,
  type AdminUserUpdate,
} from '../lib/adminApi';
import AdminAuditLogView from './AdminAuditLogView';


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

const banOptions = [
  { label: 'BAN 1M', durationMs: 60 * 1000 },
  { label: 'BAN 1H', durationMs: 60 * 60 * 1000 },
  { label: 'BAN 24H', durationMs: 24 * 60 * 60 * 1000 },
  { label: 'BAN 7D', durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const;


export default function AdminUserPanel({
  open,
  currentUserId,
  onClose,
}: AdminUserPanelProps) {
  const [activeView, setActiveView] = useState<'users' | 'logs'>('users');
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
    if (open && activeView === 'users') void loadUsers();
  }, [activeView, open, loadUsers]);

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

  const banForDuration = (user: AdminUser, durationMs: number) => {
    const bannedUntil = new Date(Date.now() + durationMs).toISOString();
    void applyUpdate(user, { status: 'banned', banned_until: bannedUntil });
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="admin-panel-title">
      <div className="flex h-[calc(100dvh-1rem)] max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl sm:h-[86vh]">
        <div className="flex min-w-0 items-center justify-between border-b border-slate-700 px-3 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 id="admin-panel-title" className="text-base font-black text-teal-300 sm:text-lg">Admin Control Center</h2>
            <p className="truncate text-[10px] text-slate-400 sm:text-xs">
              {activeView === 'users'
                ? 'Change roles or temporarily suspend platform access.'
                : 'Review platform activity. Audit logs are read-only.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="ml-2 shrink-0 rounded-md px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close admin control center">✕</button>
        </div>

        <div className="flex gap-1 border-b border-slate-700 bg-slate-950/50 px-3 pt-2 sm:px-5" role="tablist" aria-label="Admin control sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'users'}
            onClick={() => setActiveView('users')}
            className={`border-b-2 px-3 py-2 text-[10px] font-bold sm:px-4 sm:text-xs ${activeView === 'users' ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            USER CONTROL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'logs'}
            onClick={() => setActiveView('logs')}
            className={`border-b-2 px-3 py-2 text-[10px] font-bold sm:px-4 sm:text-xs ${activeView === 'logs' ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            ACTIVITY LOGS
          </button>
        </div>

        {activeView === 'users' ? (
          <>
            {error && (
              <div className="mx-3 mt-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200 sm:mx-5 sm:mt-4 sm:px-4 sm:text-sm">
                {error}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-5">
              {loading ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading users…</div>
              ) : (
                <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-left text-xs sm:min-w-[780px]">
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
                                  {banOptions.map((option) => (
                                    <button
                                      key={option.label}
                                      type="button"
                                      disabled={isSelf || isUpdating}
                                      onClick={() => banForDuration(item, option.durationMs)}
                                      className="rounded border border-red-500/30 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                    >
                                      {option.label}
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

            <div className="flex justify-end border-t border-slate-700 px-3 py-2 sm:px-5 sm:py-3">
              <button type="button" onClick={() => void loadUsers()} disabled={loading} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                REFRESH
              </button>
            </div>
          </>
        ) : (
          <AdminAuditLogView />
        )}
      </div>
    </div>,
    document.body,
  );
}
