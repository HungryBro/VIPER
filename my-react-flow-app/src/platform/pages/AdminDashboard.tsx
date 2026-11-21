// Dashboard ผู้ดูแล (role=admin) T17 ย้ายจาก AdminDashboard ของ mockup v2 ตัวเลขมาจาก API จริง:
//  - ผู้ใช้ที่เปิดใช้งาน = จำนวนผู้ใช้ใน /api/admin/users ที่ status = 'active' ไม่นับบัญชีระบบ (provider 'system' เช่น VIPER Official) (B5)
//  - Template = จำนวน template ที่ admin เห็นได้ (Official + Public + Private ของตัวเอง) นับ id ไม่ซ้ำ
//  - เหตุการณ์ = X-Total-Count ของ /api/admin/audit-logs
// ส่วนคอร์สและงานรอตรวจยังไม่มีระบบรองรับ จึงไม่แสดง
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Library, ScrollText, Users } from 'lucide-react';

import { listAdminAuditLogPage, listAdminUsers } from '../../lib/adminApi';
import { listMyTemplates, listOfficialTemplates, listPublicTemplates } from '../../lib/templateApi';
import { Stat } from '../DashboardParts';
import { num, useLoaded } from '../useLoaded';
import { Button } from '../ui';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const users = useLoaded(listAdminUsers, 'โหลดผู้ใช้ไม่สำเร็จ');
  const templatesLoader = useCallback(async () => {
    const [official, pub, mine] = await Promise.all([listOfficialTemplates(), listPublicTemplates(), listMyTemplates()]);
    return new Set([...official, ...pub, ...mine].map((template) => template.id)).size;
  }, []);
  const templates = useLoaded(templatesLoader, 'โหลด Template ไม่สำเร็จ');
  const eventsLoader = useCallback(async () => (await listAdminAuditLogPage({ limit: 1 })).total, []);
  const events = useLoaded(eventsLoader, 'โหลดเหตุการณ์ไม่สำเร็จ');

  const activeUsers = users.data ? users.data.filter((user) => user.status === 'active' && user.provider !== 'system').length : null;
  const errors = [users.error, templates.error, events.error].filter(Boolean);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Platform Overview</h1>
          <p>จัดการผู้ใช้ สิทธิ์ผู้สอน และดูภาพรวมการใช้งานแพลตฟอร์ม</p>
        </div>
        <Button onClick={() => navigate('/users')}>
          <Users size={16} />
          จัดการผู้ใช้
        </Button>
      </div>
      <div className="overview-stats">
        <Stat label="ผู้ใช้ที่เปิดใช้งาน" value={num(activeUsers)} icon={Users} />
        <Stat label="Template" value={num(templates.data)} icon={Library} />
        <Stat label="เหตุการณ์ทั้งหมด" value={num(events.data)} icon={ScrollText} />
      </div>
      {errors.map((message) => (
        <p key={message} className="muted small" role="alert">
          {message}
        </p>
      ))}
      <section className="panel admin-links">
        <h2>จัดการพื้นที่เรียนรู้</h2>
        <button type="button" onClick={() => navigate('/users')}>
          <Users size={21} />
          <span>
            <strong>ผู้ใช้ สถานะ และสิทธิ์ผู้สอน</strong>
            <small>เปิดสิทธิ์ผู้สอนให้บัญชีที่ต้องสร้างคอร์ส</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button type="button" onClick={() => navigate('/templates')}>
          <Library size={21} />
          <span>
            <strong>คลัง Template</strong>
            <small>สร้างและจัดการ Official Template</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button type="button" onClick={() => navigate('/logs')}>
          <ScrollText size={21} />
          <span>
            <strong>Platform Logs</strong>
            <small>ดูเหตุการณ์และการใช้งานของทุกบัญชี</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}
