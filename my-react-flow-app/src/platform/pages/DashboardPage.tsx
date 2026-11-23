// Dashboard ผู้เรียน (T17) ย้ายจาก Dashboard ของ mockup v2 ตัวเลขมาจาก /api/me/summary และ
// "การประมวลผลล่าสุด" มาจาก audit processing.run ของตัวเองผ่าน /api/me/activity?action=processing.run&runs=true
// (เฉพาะที่สั่งรัน ไม่นับการ poll งานเทรน B2)
// ส่วนคอร์ส ไทม์ไลน์ ความคืบหน้า ฟีดแบค ยังไม่มีระบบรองรับ จึงเป็นสถานะว่าง
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, BookOpen, ChevronRight, CircleHelp, GraduationCap, History, Workflow } from 'lucide-react';

import { listMyActivityPage, getMySummary, type MeActivity } from '../../lib/meApi';
import { num, useLoaded } from '../useLoaded';
import { Button, Empty, cx, time } from '../ui';

const RECENT_RUNS = 3;

const runTitle = (log: MeActivity): string => {
  const operation = log.details.operation;
  return typeof operation === 'string' && operation ? operation : (log.target_id ?? 'processing');
};
const runSucceeded = (log: MeActivity): boolean => log.details.success === true;

export default function DashboardPage() {
  const navigate = useNavigate();
  const summary = useLoaded(getMySummary, 'โหลดสรุปไม่สำเร็จ');
  const recentLoader = useCallback(
    () => listMyActivityPage({ limit: RECENT_RUNS, action: ['processing.run'], runs: true }),
    [],
  );
  const recent = useLoaded(recentLoader, 'โหลดการประมวลผลล่าสุดไม่สำเร็จ');
  const stats = summary.data;

  return (
    <div className="page dashboard">
      <div className="page-heading">
        <div>
          <h1>Learning Dashboard</h1>
          <p>เรียนต่อจากงานเดิม หรือเลือกบทเรียนที่ต้องการทดลอง</p>
        </div>
        <div className="date-label">
          ความคืบหน้าการเรียน <GraduationCap size={20} />
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>เส้นทางการเรียน</h2>
                <p>ลำดับบทเรียนและความคืบหน้าของคุณ</p>
              </div>
            </div>
            <Empty icon={BookOpen} title="ยังไม่มีคอร์ส">
              เมื่อมีระบบคอร์ส ไทม์ไลน์การเรียนและบทเรียนที่ลงทะเบียนจะแสดงที่นี่ ระหว่างนี้ทดลอง Workflow ได้ใน Lab
            </Empty>
            <Button onClick={() => navigate('/lab')}>
              <Workflow size={16} />
              เปิด VIPER Lab
              <ArrowRight size={16} />
            </Button>
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="panel progress-panel">
            <div className="section-title">
              <h2>สรุปความคืบหน้า</h2>
              <BarChart3 size={18} />
            </div>
            <div className="stat-pair">
              <span>
                การประมวลผลที่สั่งรัน
                <strong>
                  {num(stats?.run_count)} <small>ครั้ง</small>
                </strong>
              </span>
              <span>
                Template ของฉัน
                <strong>
                  {num(stats?.template_count)} <small>รายการ</small>
                </strong>
              </span>
            </div>
            {summary.error && (
              <p className="muted small" role="alert">
                {summary.error}
              </p>
            )}
          </section>
          <section className="panel next-panel">
            <span className="tip-icon">
              <CircleHelp size={20} />
            </span>
            <h3>ลองเปลี่ยนทีละค่า</h3>
            <p>รันค่าเริ่มต้นก่อน แล้วปรับเพียงหนึ่งพารามิเตอร์ คุณจะเห็นชัดขึ้นว่าอะไรทำให้ผลลัพธ์เปลี่ยนไป</p>
            <button type="button" className="text-btn" onClick={() => navigate('/lab')}>
              ไปทดลอง
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="panel recent-panel">
            <div className="section-title">
              <h2>การประมวลผลที่สั่งรันล่าสุด</h2>
              <History size={17} />
            </div>
            {recent.loading ? (
              <p className="muted small">กำลังโหลด…</p>
            ) : recent.error ? (
              <p className="muted small" role="alert">
                {recent.error}
              </p>
            ) : recent.data && recent.data.items.length > 0 ? (
              recent.data.items.map((log) => (
                <button key={log.id} type="button" className="recent-item" onClick={() => navigate('/lab')}>
                  <span className={cx('activity-dot', runSucceeded(log) && 'good')} />
                  <span>
                    <strong>{runTitle(log)}</strong>
                    <small>{runSucceeded(log) ? 'สำเร็จ' : 'ไม่สำเร็จ'}</small>
                    <small>{time(log.created_at)}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
            ) : (
              <p className="muted small">เมื่อคุณรันทดลอง ผลแต่ละรอบจะปรากฏที่นี่</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
