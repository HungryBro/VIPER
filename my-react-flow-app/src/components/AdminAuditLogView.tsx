import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  listAdminAuditLogs,
  type AdminAuditLog,
} from '../lib/adminApi';


type AuditCategory = 'all' | 'login' | 'template' | 'comment' | 'ban' | 'permission' | 'processing';

const categoryOptions: Array<{ value: AuditCategory; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'login', label: 'Login' },
  { value: 'template', label: 'Template' },
  { value: 'comment', label: 'Comment' },
  { value: 'ban', label: 'Ban' },
  { value: 'permission', label: 'Permission' },
  { value: 'processing', label: 'Processing' },
];

const actionLabels: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'template.create': 'Created template',
  'template.update': 'Updated template',
  'template.cover_update': 'Updated template cover',
  'template.load': 'Loaded template',
  'comment.create': 'Created comment',
  'comment.delete': 'Deleted comment',
  'ban.apply': 'Applied temporary ban',
  'ban.remove': 'Removed ban',
  'ban.expire': 'Temporary ban expired',
  'permission.role_update': 'Changed user role',
  'permission.comments_update': 'Changed comment permission',
  'permission.template_visibility_update': 'Changed template visibility',
  'processing.run': 'Ran image processing',
  'processing.upload': 'Uploaded processing input',
};


function auditCategory(log: AdminAuditLog): Exclude<AuditCategory, 'all'> {
  if (log.action.startsWith('auth.')) return 'login';
  if (log.action.startsWith('template.')) return 'template';
  if (log.action.startsWith('comment.')) return 'comment';
  if (log.action.startsWith('ban.') || log.action === 'account.ban_expired') return 'ban';
  if (log.action.startsWith('permission.')) return 'permission';
  if (log.action.startsWith('processing.')) return 'processing';

  if (log.action === 'admin.user_access_updated') {
    const changes = log.details.changes;
    if (changes && typeof changes === 'object' && 'ban' in changes) return 'ban';
    return 'permission';
  }
  if (log.action === 'admin.template_comments_updated') return 'permission';
  return 'template';
}


function formatDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}


function categoryStyle(category: Exclude<AuditCategory, 'all'>): string {
  const styles: Record<Exclude<AuditCategory, 'all'>, string> = {
    login: 'bg-sky-500/15 text-sky-300',
    template: 'bg-violet-500/15 text-violet-300',
    comment: 'bg-amber-500/15 text-amber-300',
    ban: 'bg-red-500/15 text-red-300',
    permission: 'bg-fuchsia-500/15 text-fuchsia-300',
    processing: 'bg-teal-500/15 text-teal-300',
  };
  return styles[category];
}


export default function AdminAuditLogView() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [category, setCategory] = useState<AuditCategory>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await listAdminAuditLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (category !== 'all' && auditCategory(log) !== category) return false;
      if (!term) return true;
      return [
        log.action,
        log.actor?.display_name,
        log.actor?.email,
        log.target_type,
        log.target_id,
        log.request_path,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [category, logs, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-5 py-3">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as AuditCategory)}
          className="rounded-md border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
          aria-label="Filter activity category"
        >
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search actor, action or target"
          className="min-w-56 flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600"
        />
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          Read only
        </span>
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={loading}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          REFRESH
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading activity logs…</div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No activity logs found.</div>
        ) : (
          <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3">Time</th>
                <th className="px-3">Activity</th>
                <th className="px-3">Actor</th>
                <th className="px-3">Target</th>
                <th className="px-3">Result</th>
                <th className="px-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const logCategory = auditCategory(log);
                const statusCode = log.status_code;
                const succeeded = statusCode === null || statusCode < 400;
                return (
                  <tr key={log.id} className="bg-slate-800/70 align-top text-slate-200">
                    <td className="rounded-l-lg px-3 py-3 whitespace-nowrap text-slate-400">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold">{actionLabels[log.action] || log.action}</div>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${categoryStyle(logCategory)}`}>
                        {logCategory}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div>{log.actor?.display_name || 'System'}</div>
                      <div className="text-[9px] text-slate-500">{log.actor?.email || 'No active account'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{log.target_type || '—'}{log.target_id ? ` #${log.target_id}` : ''}</div>
                      <div className="max-w-52 truncate text-[9px] text-slate-500" title={log.request_path || ''}>
                        {log.request_path || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${succeeded ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                        {statusCode ?? '—'}
                      </span>
                    </td>
                    <td className="rounded-r-lg px-3 py-3">
                      {Object.keys(log.details).length === 0 ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <details className="max-w-80">
                          <summary className="cursor-pointer text-teal-300 hover:text-teal-200">View details</summary>
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-2 text-[9px] text-slate-400">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
