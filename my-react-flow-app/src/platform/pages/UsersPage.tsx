// หน้า Users (T9) ย้ายจาก AdminUsers ของ mockup v2 ต่อผู้ใช้จริงจาก /api/admin/users
// รวมความสามารถของ AdminUserPanel เดิม: เปลี่ยน role, แบนแบบเลือกระยะเวลา, ยกเลิกแบน
// สิทธิ์ผู้สอน (can_teach) เปิด/ปิดผ่าน modal ยืนยัน (C-10) ฝั่ง server ตรวจสิทธิ์ admin ซ้ำทุกครั้ง
import { useCallback, useEffect, useState } from 'react';
import { Clock3, Search, ShieldAlert } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import {
  banOptions,
  listAdminUsers,
  updateAdminUser,
  type AdminUser,
  type AdminUserUpdate,
} from '../../lib/adminApi';
import { isAdmin, roleLabel } from '../permissions';
import { useToast } from '../toast';
import { Badge, Button, Empty, Modal, cx, time } from '../ui';

type Confirm = { title: string; message: string; update: AdminUserUpdate; done: string; user: AdminUser };

const joinedOn = (value: string): string =>
  new Date(value).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });

function UsersTable({ currentUserId }: { currentUserId: number }) {
  const notify = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listAdminUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (user: AdminUser, update: AdminUserUpdate, done: string) => {
    setUpdatingId(user.id);
    try {
      const updated = await updateAdminUser(user.id, update);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      notify(done);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'อัปเดตผู้ใช้ไม่สำเร็จ');
    } finally {
      setUpdatingId(null);
    }
  };

  const askTeach = (user: AdminUser) =>
    setConfirm({
      user,
      title: `${user.can_teach ? 'ปิด' : 'เปิด'}สิทธิ์ผู้สอนของ ${user.display_name}?`,
      message: user.can_teach
        ? 'บัญชีนี้จะสร้างคอร์สและตรวจงานไม่ได้อีก คอร์สที่มีอยู่จะยังอยู่ในระบบ'
        : 'บัญชีนี้จะสร้างคอร์ส ออกแบบ Lab และตรวจงานของผู้เรียนในคอร์สตัวเองได้',
      update: { can_teach: !user.can_teach },
      done: 'อัปเดตสิทธิ์ผู้สอนและบันทึก Platform Log แล้ว',
    });

  const askBan = (user: AdminUser, label: string, durationMs: number) =>
    setConfirm({
      user,
      title: `แบน ${user.display_name} (${label})?`,
      message: 'บัญชีนี้จะเข้าใช้งานไม่ได้จนกว่าจะครบกำหนด หรือจนกว่าผู้ดูแลจะยกเลิกแบน',
      update: { status: 'banned', banned_until: new Date(Date.now() + durationMs).toISOString() },
      done: 'แบนผู้ใช้แล้ว',
    });

  const needle = query.trim().toLowerCase();
  const shown = users.filter((account) =>
    `${account.display_name} ${account.email} ${roleLabel(account)}`.toLowerCase().includes(needle),
  );

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>User Management</h1>
          <p>จัดการบัญชี สิทธิ์ผู้สอน และสถานะของผู้ใช้</p>
        </div>
        <Badge>{users.length} ผู้ใช้</Badge>
      </div>
      <label className="search-field users-search">
        <Search size={17} />
        <input
          aria-label="ค้นหาผู้ใช้"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหาชื่อ อีเมล หรือบทบาท"
        />
      </label>
      {error ? (
        <section className="panel">
          <Empty
            icon={ShieldAlert}
            title="โหลดรายชื่อผู้ใช้ไม่สำเร็จ"
            action={<Button kind="secondary" onClick={() => void load()}>ลองอีกครั้ง</Button>}
          >
            {error}
          </Empty>
        </section>
      ) : loading ? (
        <section className="panel" role="status" aria-busy="true">
          <Empty icon={Clock3} title="กำลังโหลดผู้ใช้">กรุณารอสักครู่</Empty>
        </section>
      ) : (
        <section className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>ผู้ใช้</th>
                <th>บทบาท</th>
                <th>สิทธิ์ผู้สอน</th>
                <th>เข้าใช้งานล่าสุด</th>
                <th>สถานะ</th>
                <th>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((account) => {
                const isSelf = account.id === currentUserId;
                const busy = account.id === updatingId;
                const banned = account.status === 'banned';
                return (
                  <tr key={account.id} data-user-id={account.id}>
                    <td>
                      <strong>
                        {account.display_name}
                        {isSelf ? ' (คุณ)' : ''}
                      </strong>
                      <small>{account.email}</small>
                    </td>
                    <td>
                      <select
                        value={account.role}
                        disabled={isSelf || busy}
                        aria-label={`บทบาทของ ${account.email}`}
                        onChange={(event) =>
                          void apply(account, { role: event.target.value as 'admin' | 'user' }, 'อัปเดตบทบาทและบันทึก Platform Log แล้ว')
                        }
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      <small>{roleLabel(account)}</small>
                    </td>
                    <td>
                      <div className="comment-switch-row">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isAdmin(account) || account.can_teach}
                          aria-label={`สิทธิ์ผู้สอนของ ${account.display_name}`}
                          className={cx('toggle-switch', (isAdmin(account) || account.can_teach) && 'on')}
                          disabled={isAdmin(account) || isSelf || busy}
                          onClick={() => askTeach(account)}
                        >
                          <span />
                        </button>
                        <small>{isAdmin(account) ? 'ผู้ดูแลสอนได้เสมอ' : account.can_teach ? 'เปิดอยู่' : 'ปิดอยู่'}</small>
                      </div>
                    </td>
                    <td>
                      <strong className="last-seen">
                        <Clock3 size={13} />
                        {time(account.last_login_at)}
                      </strong>
                      <small>เข้าร่วม {joinedOn(account.created_at)}</small>
                    </td>
                    <td>
                      <Badge tone={banned ? 'red' : 'teal'}>{banned ? 'ถูกแบน' : 'เปิดใช้งาน'}</Badge>
                      {banned && <small>ถึง {account.banned_until ? time(account.banned_until) : 'ไม่มีกำหนด'}</small>}
                    </td>
                    <td>
                      {banned ? (
                        <Button
                          kind="secondary"
                          disabled={isSelf || busy}
                          onClick={() => void apply(account, { status: 'active' }, 'ยกเลิกแบนแล้ว')}
                        >
                          ยกเลิกแบน
                        </Button>
                      ) : (
                        <select
                          value=""
                          disabled={isSelf || busy}
                          aria-label={`แบน ${account.email}`}
                          onChange={(event) => {
                            const option = banOptions.find((item) => item.label === event.target.value);
                            if (option) askBan(account, option.label, option.durationMs);
                          }}
                        >
                          <option value="">แบนชั่วคราว…</option>
                          {banOptions.map((option) => (
                            <option key={option.label} value={option.label}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && (
            <Empty icon={Search} title="ไม่พบผู้ใช้">
              ลองใช้คำค้นอื่น
            </Empty>
          )}
        </section>
      )}
      <p className="muted small admin-note">
        แบนได้ครั้งละ 1 นาที 1 ชั่วโมง 24 ชั่วโมง หรือ 7 วัน · เปลี่ยนบทบาท แบน หรือปิดสิทธิ์ของตัวเองไม่ได้ ·
        ทุกการเปลี่ยนแปลงบันทึกใน Platform Logs
      </p>
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="modal-body">
            <p>{confirm.message}</p>
          </div>
          <div className="modal-actions">
            <Button kind="secondary" onClick={() => setConfirm(null)}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => {
                const { user, update, done } = confirm;
                setConfirm(null);
                void apply(user, update, done);
              }}
            >
              ยืนยัน
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function UsersPage() {
  const { user } = useAuth();
  // ผู้ใช้ธรรมดาไม่เรียก API admin เลย (server ปฏิเสธอยู่แล้ว หน้านี้แค่แจ้งสถานะ)
  if (!user || !isAdmin(user)) {
    return (
      <div className="page">
        <Empty icon={ShieldAlert} title="สำหรับผู้ดูแลเท่านั้น">
          หน้านี้จัดการบัญชีผู้ใช้และสิทธิ์ผู้สอน ต้องใช้บัญชีผู้ดูแลระบบ
        </Empty>
      </div>
    );
  }
  return <UsersTable currentUserId={user.id} />;
}
