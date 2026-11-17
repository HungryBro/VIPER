// หน้า Profile (T16) ย้ายจาก AccountProfile ของ mockup v2 แสดงข้อมูลบัญชีจาก Google แบบอ่านอย่างเดียว
// ไม่ย้ายแท็บ "แก้ไขข้อมูล" ช่องแก้อีเมล ปุ่มนำเข้าอีเมลสาธิต และ department / studentId / bio (P-28 ตัดออก)
// ตัวเลขทั้งหมดมาจาก /api/me/summary, /api/templates/mine และ /api/me/activity
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, FileText, History, Library, Mail, UserRound, Workflow } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { actionLabels } from '../../components/AdminAuditLogView';
import { getMySummary, listMyActivityPage, type MeActivity, type MeSummary } from '../../lib/meApi';
import { listMyTemplates, type TemplateSummary } from '../../lib/templateApi';
import { roleLabel } from '../permissions';
import { kindOf } from '../templateAccess';
import { VisibilityBadge } from '../TemplateBadges';
import { useOpenInLab } from '../useOpenInLab';
import { Badge, Button, Empty, cx, time } from '../ui';

type Tab = 'overview' | 'history' | 'works';
const TABS: Array<[Tab, string, typeof UserRound]> = [
  ['overview', 'ภาพรวม', UserRound],
  ['history', 'ประวัติ', History],
  ['works', 'ผลงาน', Workflow],
];

const ACTIVITY_PAGE_SIZE = 30;

const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

function useLoaded<T>(load: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let active = true;
    loadRef
      .current()
      .then((value) => active && setData(value))
      .catch((failure) => active && setError(errorText(failure, fallback)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fallback]);
  return { data, error, loading };
}

function ActivityList() {
  const [items, setItems] = useState<MeActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadPage = useCallback(async (offset: number) => {
    const id = ++requestId.current;
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const page = await listMyActivityPage({ limit: ACTIVITY_PAGE_SIZE, offset });
      if (id !== requestId.current) return;
      setItems((previous) => (offset === 0 ? page.items : [...previous, ...page.items]));
      setTotal(page.total);
    } catch (failure) {
      if (id === requestId.current) setError(errorText(failure, 'โหลดประวัติไม่สำเร็จ'));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  return (
    <section className="panel">
      <div className="section-title">
        <h2>กิจกรรมล่าสุด</h2>
        {!loading && !error && <Badge>{total}</Badge>}
      </div>
      {loading ? (
        <p className="muted small">กำลังโหลดประวัติ…</p>
      ) : error && items.length === 0 ? (
        <div role="alert">
          <p className="muted small">{error}</p>
          <Button kind="secondary" onClick={() => void loadPage(0)}>
            ลองใหม่
          </Button>
        </div>
      ) : items.length === 0 ? (
        <Empty icon={History} title="ยังไม่มีกิจกรรม">
          เมื่อคุณเข้าสู่ระบบ บันทึก Template หรือรัน Workflow รายการจะปรากฏที่นี่
        </Empty>
      ) : (
        <>
          <div className="profile-event-list">
            {items.map((log) => {
              const ok = log.status_code === null || log.status_code < 400;
              return (
                <div key={log.id}>
                  <span className={cx('activity-dot', ok && 'good')} />
                  <div>
                    <strong>{actionLabels[log.action] ?? log.action}</strong>
                    <p>{log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}` : '—'}</p>
                    <small>{time(log.created_at)}</small>
                  </div>
                </div>
              );
            })}
          </div>
          {error && (
            <p className="muted small" role="alert">
              {error}
            </p>
          )}
          {items.length < total && (
            <Button kind="secondary" disabled={loadingMore} onClick={() => void loadPage(items.length)}>
              {loadingMore ? 'กำลังโหลด…' : `โหลดเพิ่ม (${items.length}/${total})`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function WorkCard({ template, onOpen, opening }: { template: TemplateSummary; onOpen: () => void; opening: boolean }) {
  return (
    <article className="panel profile-work-card">
      <VisibilityBadge kind={kindOf(template)} />
      <h3>{template.name}</h3>
      <p>{template.description}</p>
      <div>
        <span>อัปเดต {time(template.updated_at)}</span>
      </div>
      <button type="button" className="text-btn" disabled={opening} onClick={onOpen}>
        เปิดใน Lab
        <ArrowRight size={14} />
      </button>
    </article>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openInLab, openingId } = useOpenInLab();
  const [tab, setTab] = useState<Tab>('overview');
  const summary = useLoaded<MeSummary>(getMySummary, 'โหลดสรุปไม่สำเร็จ');
  const works = useLoaded<TemplateSummary[]>(listMyTemplates, 'โหลดผลงานไม่สำเร็จ');

  if (!user) return null;
  const initials = user.display_name.slice(0, 2).toUpperCase();
  const stats = summary.data;
  const templates = works.data ?? [];
  const num = (value: number | undefined) => (value === undefined ? '–' : value);

  return (
    <div className="page account-profile">
      <div className="page-heading">
        <div>
          <h1>Profile</h1>
          <p>ข้อมูลบัญชี ประวัติการใช้งาน และผลงานของคุณ</p>
        </div>
        <Button kind="secondary" onClick={() => navigate('/lab')}>
          <Workflow size={16} />
          เปิด VIPER Lab
        </Button>
      </div>

      <section className="panel profile-hero">
        <div className="profile-avatar">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            initials
          )}
        </div>
        <div className="profile-hero-copy">
          <div>
            <h2>{user.display_name}</h2>
            <Badge tone="blue">{roleLabel(user)}</Badge>
          </div>
          <p>
            <Mail size={14} />
            {user.email}
          </p>
          <small>บัญชี Google · ข้อมูลนี้แก้ไขได้ที่บัญชี Google ของคุณ</small>
        </div>
        <div className="profile-hero-stats">
          <span>
            <strong>{num(stats?.template_count)}</strong>ผลงาน
          </span>
          <span>
            <strong>{num(stats?.activity_count)}</strong>กิจกรรม
          </span>
          <span>
            <strong>{num(stats?.run_count)}</strong>การทดลอง
          </span>
        </div>
      </section>
      {summary.error && (
        <p className="muted small" role="alert">
          {summary.error}
        </p>
      )}

      <div className="tabs profile-tabs" role="tablist">
        {TABS.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'works' ? (
        <section>
          <div className="section-title">
            <div>
              <h2>Workflow และ Template ของฉัน</h2>
              <p>ทั้งผลงาน Public และร่าง Private ของบัญชีนี้</p>
            </div>
            <Button kind="secondary" onClick={() => navigate('/templates')}>
              <Library size={14} />
              ไปคลัง Template
            </Button>
          </div>
          {works.loading ? (
            <p className="muted small">กำลังโหลดผลงาน…</p>
          ) : works.error ? (
            <p className="muted small" role="alert">
              {works.error}
            </p>
          ) : templates.length === 0 ? (
            <Empty icon={Workflow} title="ยังไม่มีผลงานที่บันทึก">
              สร้าง Workflow ใน Lab แล้วบันทึกเป็น Template เพื่อเก็บไว้ในโปรไฟล์
            </Empty>
          ) : (
            <div className="profile-work-grid">
              {templates.map((template) => (
                <WorkCard
                  key={template.id}
                  template={template}
                  opening={openingId === template.id}
                  onOpen={() => void openInLab(template)}
                />
              ))}
            </div>
          )}
        </section>
      ) : tab === 'history' ? (
        <div className="profile-history-grid">
          <section className="panel">
            <div className="section-title">
              <h2>ประวัติการเรียนและส่งงาน</h2>
              <Badge>0</Badge>
            </div>
            <Empty icon={FileText} title="ยังไม่มีงานที่ส่ง">
              เมื่อมีระบบคอร์ส งานที่คุณส่งและผลตรวจจะแสดงที่นี่
            </Empty>
          </section>
          <ActivityList />
        </div>
      ) : (
        <div className="profile-history-grid">
          <section className="panel">
            <div className="section-title">
              <h2>บทเรียนและผลการเรียน</h2>
            </div>
            <Empty icon={BookOpen} title="ยังไม่มีบทเรียน">
              เมื่อมีระบบคอร์ส บทเรียนที่ลงทะเบียนและผลการเรียนจะแสดงที่นี่
            </Empty>
          </section>
          <section className="panel">
            <div className="section-title">
              <h2>ผลงานล่าสุด</h2>
              <button type="button" className="text-btn" onClick={() => setTab('works')}>
                ดูทั้งหมด
                <ArrowRight size={14} />
              </button>
            </div>
            {works.loading ? (
              <p className="muted small">กำลังโหลดผลงาน…</p>
            ) : works.error ? (
              <p className="muted small" role="alert">
                {works.error}
              </p>
            ) : templates.length === 0 ? (
              <p className="muted small">ยังไม่มี Template ที่บันทึก</p>
            ) : (
              templates.slice(0, 3).map((template) => (
                <div className="profile-latest-work" key={template.id}>
                  <Workflow size={18} />
                  <div>
                    <strong>{template.name}</strong>
                    <small>{time(template.updated_at)}</small>
                  </div>
                  <VisibilityBadge kind={kindOf(template)} />
                </div>
              ))
            )}
            <div className="profile-experiment-note">
              <Badge tone="blue">{num(stats?.run_count)} การทดลอง</Badge>
              <p>จำนวนครั้งที่คุณรัน Workflow ใน Lab ดูรายการแต่ละครั้งได้ในแท็บประวัติ</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
