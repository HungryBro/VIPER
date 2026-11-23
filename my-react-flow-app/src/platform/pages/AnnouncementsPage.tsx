// หน้า Announcements (T20) ย้ายจาก Announcements ของ mockup v2 route /announcements
// ข้อมูลประกาศมาจาก src/lib/learningApi.ts เท่านั้น (ตอนนี้ว่าง) ฟอร์มเผยแพร่ประกาศของผู้สอนไม่เปิดใช้ (ว่างตามแผน)
import { Megaphone, Send } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { listAnnouncements } from '../../lib/learningApi';
import { canTeach, isAdmin } from '../permissions';
import { useLoaded } from '../useLoaded';
import { Badge, Button, Empty, time } from '../ui';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { data, error, loading } = useLoaded(listAnnouncements, 'โหลดประกาศไม่สำเร็จ');
  // แสดงหน้าแรกของรายการ (data.next ใช้ต่อเมื่อมีระบบประกาศ)
  const items = data?.items ?? [];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Announcements</h1>
          <p>ข่าวสารจากผู้สอนในคอร์สที่เกี่ยวข้อง</p>
        </div>
      </div>
      {(canTeach(user) || isAdmin(user)) && (
        <form className="panel announcement-form" onSubmit={(event) => event.preventDefault()}>
          <h2>เขียนประกาศ</h2>
          <label className="field">
            คอร์ส
            <select disabled>
              <option>ยังไม่มีคอร์สของคุณ</option>
            </select>
          </label>
          <label className="field">
            หัวข้อ
            <input disabled />
          </label>
          <label className="field">
            ข้อความ
            <textarea rows={4} disabled />
          </label>
          <Button disabled title="ระบบคอร์สจะเพิ่มภายหลัง">
            <Send size={15} />
            เผยแพร่ประกาศ
          </Button>
        </form>
      )}
      {error && <div className="validation-message" role="alert">{error}</div>}
      {loading && <p className="muted small" role="status">กำลังโหลด...</p>}
      {items.map((item) => (
        <article className="panel announcement-item" key={item.id}>
          <Badge tone="blue">{item.courseTitle}</Badge>
          <h2>{item.title}</h2>
          <small>
            {item.author} · {time(item.at)}
          </small>
          <p>{item.body}</p>
        </article>
      ))}
      {!loading && !error && !items.length && (
        <Empty icon={Megaphone} title="ยังไม่มีประกาศ">
          เมื่อผู้สอนเผยแพร่ประกาศในคอร์สที่คุณลงทะเบียน จะแสดงที่นี่ (ระบบคอร์สจะเพิ่มภายหลัง)
        </Empty>
      )}
    </div>
  );
}
