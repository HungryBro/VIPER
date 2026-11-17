// Dashboard ผู้สอน (can_teach) T17 ย้ายจาก InstructorDashboard ของ mockup v2
// ยังไม่มีระบบคอร์สและการส่งงาน: ตัวเลขคอร์ส/งานรอตรวจเป็น 0 และรายการคอร์สเป็นสถานะว่าง
// Template ของฉันมาจาก /api/me/summary
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCheck, FileText, Library } from 'lucide-react';

import { getMySummary } from '../../lib/meApi';
import { Stat } from '../DashboardParts';
import { num, useLoaded } from '../useLoaded';
import { Button, Empty } from '../ui';

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const summary = useLoaded(getMySummary, 'โหลดสรุปไม่สำเร็จ');

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Instructor Dashboard</h1>
          <p>จัดการคอร์ส ตรวจงานที่ส่ง และให้ฟีดแบคแก่ผู้เรียนของคุณ</p>
        </div>
        <Button onClick={() => navigate('/templates')}>
          <Library size={17} />
          จัดการ Template
          <ArrowRight size={16} />
        </Button>
      </div>
      <div className="overview-stats">
        {/* ยังไม่มีระบบคอร์ส: สองช่องนี้เป็น 0 คงที่ ไม่ได้มาจาก API */}
        <Stat label="คอร์สของคุณ" value={0} icon={BookOpen} />
        <Stat label="งานที่รอตรวจ" value={0} icon={FileText} />
        <Stat label="Template ของฉัน" value={num(summary.data?.template_count)} icon={CheckCheck} />
      </div>
      {summary.error && (
        <p className="muted small" role="alert">
          {summary.error}
        </p>
      )}
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>คอร์สของคุณ</h2>
            <p>คลิกจัดการเพื่อแก้บทเรียนและออกแบบ Lab</p>
          </div>
        </div>
        <Empty icon={BookOpen} title="ยังไม่มีคอร์ส">
          เมื่อมีระบบคอร์ส คอร์สที่คุณสอนและงานที่รอตรวจจะแสดงที่นี่ ระหว่างนี้สร้างและแชร์ Template ได้ในคลัง Template
        </Empty>
      </section>
    </div>
  );
}
