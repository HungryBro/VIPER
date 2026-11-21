// หน้า Platform Logs (T11) ย้ายจาก PlatformLogs + LogDetail ของ mockup v2 ต่อ audit_logs จริง
// ผ่าน GET /api/admin/audit-logs (แบ่งหน้า ตัวกรอง คำค้น ยอดรวมทำที่ server ตาม T10)
// ไม่ย้าย LOG_INFO และ action สมมติของ mockup: ป้ายชื่อใช้ actionLabels ของ AdminAuditLogView
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Clock3, LockKeyhole, ScrollText, Search, ShieldAlert } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { actionLabels } from '../../components/AdminAuditLogView';
import {
  listAdminAuditActions,
  listAdminAuditLogPage,
  type AdminAuditActionCount,
  type AdminAuditLog,
} from '../../lib/adminApi';
import { isAdmin } from '../permissions';
import { Badge, Button, Empty, Modal, time } from '../ui';

const PAGE_SIZE = 100;

const labelOf = (action: string): string => actionLabels[action] ?? action;
const succeeded = (log: AdminAuditLog): boolean => log.status_code === null || log.status_code < 400;
const targetOf = (log: AdminAuditLog): string =>
  log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}` : '—';

// ปลายทางที่มีจริงของแต่ละเหตุการณ์ (ที่ไม่มีปลายทางจะไม่แสดงปุ่ม)
function relatedPath(action: string): string | null {
  if (action.startsWith('template.') || action === 'permission.template_visibility_update'
    || action === 'permission.template_official_update' || action === 'permission.comments_update'
    || action === 'admin.template_comments_updated') return '/templates';
  if (action.startsWith('ban.') || action === 'permission.role_update' || action === 'permission.can_teach_update'
    || action === 'admin.user_access_updated' || action === 'account.ban_expired') return '/users';
  return null;
}

function LogDetail({ log, onClose }: { log: AdminAuditLog; onClose: () => void }) {
  const navigate = useNavigate();
  const ok = succeeded(log);
  const path = relatedPath(log.action);
  const rows: Array<[string, string]> = [
    ['วันและเวลา', new Date(log.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'medium' })],
    ['ผู้กระทำ', log.actor ? `${log.actor.display_name} · ${log.actor.email}` : 'ระบบ / บัญชีที่ถูกลบ'],
    ['รหัสเหตุการณ์', String(log.id)],
    ['เหตุการณ์', log.action],
    ['ผลลัพธ์', `${ok ? 'สำเร็จ' : 'ไม่สำเร็จ'}${log.status_code !== null ? ` (${log.status_code})` : ''}`],
  ];
  return (
    <Modal title={`รายละเอียดเหตุการณ์ · ${labelOf(log.action)}`} onClose={onClose}>
      <div className="modal-body log-detail">
        <div className="log-detail-summary">
          <Badge tone={ok ? 'teal' : 'amber'}>{ok ? 'สำเร็จ' : 'ไม่สำเร็จ'}</Badge>
          <h3>{targetOf(log)}</h3>
          <p>{log.request_path ?? 'ไม่มีข้อมูลเส้นทางคำขอ'}</p>
        </div>
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{label === 'เหตุการณ์' ? <code>{value}</code> : value}</dd>
            </div>
          ))}
        </dl>
        <details className="log-code">
          <summary>ดูโค้ด (JSON)</summary>
          <pre>
            <code>{JSON.stringify(log.details, null, 2)}</code>
          </pre>
        </details>
      </div>
      <div className="modal-actions">
        <Button kind="secondary" onClick={onClose}>
          ปิด
        </Button>
        {path && (
          <Button
            onClick={() => {
              onClose();
              navigate(path);
            }}
          >
            ไปที่หน้าที่เกี่ยวข้อง
            <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </Modal>
  );
}

function LogsTable() {
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<AdminAuditActionCount[]>([]);
  const [action, setAction] = useState('all');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<AdminAuditLog | null>(null);
  const requestId = useRef(0);

  // ค้นที่ server หลังหยุดพิมพ์สั้นๆ
  useEffect(() => {
    const handle = window.setTimeout(() => setTerm(query.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    listAdminAuditActions()
      .then(setActions)
      .catch(() => setActions([]));
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    // "โหลดเพิ่ม" ที่ค้างอยู่ของตัวกรองเก่าถูกทิ้ง (requestId เปลี่ยน) finally ของมันจึงไม่รีเซ็ตให้ ต้องรีเซ็ตที่นี่
    setLoadingMore(false);
    setError(null);
    try {
      const page = await listAdminAuditLogPage({
        limit: PAGE_SIZE,
        offset: 0,
        action: action === 'all' ? undefined : [action],
        q: term,
      });
      if (id !== requestId.current) return;
      setItems(page.items);
      setTotal(page.total);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'โหลด Platform Logs ไม่สำเร็จ');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [action, term]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    const id = ++requestId.current;
    setLoadingMore(true);
    try {
      const page = await listAdminAuditLogPage({
        limit: PAGE_SIZE,
        offset: items.length,
        action: action === 'all' ? undefined : [action],
        q: term,
      });
      if (id !== requestId.current) return;
      setItems((current) => {
        const seen = new Set(current.map((log) => log.id));
        return [...current, ...page.items.filter((log) => !seen.has(log.id))];
      });
      setTotal(page.total);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'โหลด Platform Logs ไม่สำเร็จ');
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  };

  const open = (log: AdminAuditLog) => setOpenLog(log);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Platform Logs</h1>
          <p>ติดตามเหตุการณ์และประวัติการใช้งานในแพลตฟอร์ม</p>
        </div>
        <Badge>
          <LockKeyhole size={13} />
          Read only
        </Badge>
      </div>
      <div className="filter-toolbar">
        <label className="log-action-filter">
          ประเภทเหตุการณ์
          <select aria-label="กรองประเภทเหตุการณ์" value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="all">ทั้งหมด</option>
            {actions.map((item) => (
              <option value={item.action} key={item.action}>
                {/* action ที่ยังไม่มีป้ายชื่อแสดงโค้ดครั้งเดียว ไม่ซ้ำในวงเล็บ */}
                {labelOf(item.action) === item.action ? item.action : `${labelOf(item.action)} (${item.action})`} · {item.count}
              </option>
            ))}
          </select>
        </label>
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="ค้นหา Platform Logs"
            placeholder="ค้นหาผู้ใช้ เหตุการณ์ หรือเป้าหมาย..."
          />
        </label>
        <Badge tone="blue">
          <span data-testid="log-total">{total}</span> เหตุการณ์
        </Badge>
      </div>
      {error && !items.length ? (
        <section className="panel">
          <Empty
            icon={ShieldAlert}
            title="โหลด Platform Logs ไม่สำเร็จ"
            action={<Button kind="secondary" onClick={() => void load()}>ลองอีกครั้ง</Button>}
          >
            {error}
          </Empty>
        </section>
      ) : loading ? (
        <section className="panel" role="status" aria-busy="true">
          <Empty icon={Clock3} title="กำลังโหลดเหตุการณ์">กรุณารอสักครู่</Empty>
        </section>
      ) : (
        <section className="panel table-scroll platform-log-table">
          <table>
            <thead>
              <tr>
                <th>วันและเวลา</th>
                <th>ผู้กระทำ</th>
                <th>เหตุการณ์</th>
                <th>รายละเอียด</th>
                <th>ผลลัพธ์</th>
                <th>
                  <span className="sr-only">รายละเอียด</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => {
                const ok = succeeded(log);
                return (
                  <tr
                    key={log.id}
                    className="log-row"
                    data-log-id={log.id}
                    tabIndex={0}
                    onClick={() => open(log)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        open(log);
                      }
                    }}
                  >
                    <td>{time(log.created_at)}</td>
                    <td>
                      <strong>{log.actor?.display_name ?? 'ระบบ'}</strong>
                      <small>{log.actor?.email ?? 'ไม่มีบัญชี'}</small>
                    </td>
                    <td>
                      <strong>{labelOf(log.action)}</strong>
                      <small>
                        <code>{log.action}</code>
                      </small>
                    </td>
                    <td className="log-target">{targetOf(log)}</td>
                    <td>
                      <Badge tone={ok ? 'teal' : 'amber'}>{ok ? 'สำเร็จ' : 'ไม่สำเร็จ'}</Badge>
                    </td>
                    <td className="log-open">
                      <button
                        type="button"
                        className="text-btn"
                        aria-label={`ดูรายละเอียด ${log.action}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          open(log);
                        }}
                      >
                        ดู
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!items.length && (
            <Empty icon={ScrollText} title="ไม่พบเหตุการณ์">
              ลองเปลี่ยนตัวกรองหรือคำค้น
            </Empty>
          )}
        </section>
      )}
      {!loading && items.length > 0 && (
        <div className="log-pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <span className="muted small">
            แสดง {items.length} จาก {total} รายการ
          </span>
          {items.length < total ? (
            <Button kind="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
            </Button>
          ) : (
            <span className="muted small">ถึงเหตุการณ์แรกสุดแล้ว</span>
          )}
          {error && <span className="muted small" role="alert">{error}</span>}
        </div>
      )}
      <p className="muted small admin-note">
        Logs อ่านได้อย่างเดียว ไม่มีปุ่มแก้ไขหรือลบ · แสดงครั้งละ {PAGE_SIZE} รายการ กด "โหลดเพิ่ม" เพื่อดูย้อนหลังถึงรายการแรกสุด ·
        คลิกแถวเพื่อดูรายละเอียด
      </p>
      {openLog && <LogDetail log={openLog} onClose={() => setOpenLog(null)} />}
    </div>
  );
}

export default function LogsPage() {
  const { user } = useAuth();
  // ผู้ใช้ธรรมดาไม่เรียก API admin เลย (server ปฏิเสธอยู่แล้ว หน้านี้แค่แจ้งสถานะ)
  if (!user || !isAdmin(user)) {
    return (
      <div className="page">
        <Empty icon={ShieldAlert} title="สำหรับผู้ดูแลเท่านั้น">
          หน้านี้แสดงประวัติเหตุการณ์ของแพลตฟอร์ม ต้องใช้บัญชีผู้ดูแลระบบ
        </Empty>
      </div>
    );
  }
  return <LogsTable />;
}
