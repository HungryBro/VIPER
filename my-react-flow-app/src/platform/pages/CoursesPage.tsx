// หน้า Courses / Course / Lesson (T19) ย้ายจาก CourseCatalog, CoursePage, LessonPage ของ mockup v2
// route: /courses, /courses/:courseId, /lessons/:lessonId ข้อมูลทั้งหมดมาจาก src/lib/learningApi.ts เท่านั้น
// ตอนนี้ระบบคอร์สยังไม่มี learningApi คืนว่าง หน้าจึงแสดงสถานะว่างที่บอกว่าจะเพิ่มภายหลัง
// ปุ่มลงทะเบียน/จัดการ/ตัวออกแบบ Lab ไม่เปิดใช้ (ว่างตามแผน) แต่คงโครงไว้ให้ระบบคอร์สรอบหน้าต่อได้
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, LockKeyhole, Pencil, Play } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { getCourse, getLesson, listCourses, listLessons } from '../../lib/learningApi';
import type { Course, CourseStatus } from '../types';
import { canTeach, isAdmin } from '../permissions';
import { useLoaded } from '../useLoaded';
import { Badge, Button, Empty, Markdown, cx } from '../ui';

const COURSE_STATUS: Record<CourseStatus, [string, string]> = {
  draft: ['Draft', 'amber'],
  published: ['Published', 'teal'],
  archived: ['Archived', 'neutral'],
};

const COMING_LATER = 'ระบบคอร์สจะเพิ่มภายหลัง';

// แท็บ "คอร์สทั้งหมด / คอร์สที่ฉันสอน" เห็นเฉพาะผู้สอน (ผู้ดูแลก็เห็น เพราะเข้า /teach ได้)
export function CourseTabs({ active }: { active: 'courses' | 'teach' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!canTeach(user) && !isAdmin(user)) return null;
  const tabs: Array<['courses' | 'teach', string, string]> = [
    ['courses', 'คอร์สทั้งหมด', '/courses'],
    ['teach', 'คอร์สที่ฉันสอน', '/teach'],
  ];
  return (
    <div className="tabs course-tabs" role="group" aria-label="มุมมองคอร์ส">
      {tabs.map(([id, label, to]) => (
        <button key={id} type="button" className={active === id ? 'active' : ''} aria-pressed={active === id} onClick={() => navigate(to)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  const navigate = useNavigate();
  const [statusLabel, tone] = COURSE_STATUS[course.status];
  return (
    <article className="panel catalog-course">
      <div className="section-title">
        <Badge tone="blue">{course.code}</Badge>
        {course.enrolled ? (
          <Badge tone="teal">ลงทะเบียนแล้ว</Badge>
        ) : course.canManage ? (
          <Badge>คอร์สของคุณ</Badge>
        ) : course.status === 'archived' ? (
          <Badge tone={tone}>{statusLabel}</Badge>
        ) : null}
      </div>
      <h2>{course.title}</h2>
      <p>{course.description}</p>
      <small className="muted">
        ผู้สอน: {course.ownerName || 'VIPER'} · {course.lessonCount} บทเรียน
      </small>
      <div className="catalog-course-actions">
        <Button kind="secondary" onClick={() => navigate(`/courses/${course.id}`)}>
          <BookOpen size={15} />
          ดูคอร์ส
        </Button>
        {!course.enrolled && !course.canManage && course.status === 'published' ? (
          <Button disabled title={COMING_LATER}>
            ลงทะเบียน
          </Button>
        ) : (
          <Button onClick={() => navigate(`/courses/${course.id}`)}>
            <Play size={15} />
            เข้าเรียน
          </Button>
        )}
      </div>
    </article>
  );
}

// /courses: คอร์ส published ทั้งหมด (archived เฉพาะที่ลงทะเบียนไว้ ตัดสินที่ฝั่ง learningApi)
export default function CoursesPage() {
  const { data, error, loading } = useLoaded(listCourses, 'โหลดรายการคอร์สไม่สำเร็จ');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const courses = (data ?? []).filter((course) => `${course.title} ${course.description} ${course.code}`.toLowerCase().includes(needle));
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Courses</h1>
          <p>เลือกคอร์สที่สนใจ ลงทะเบียน แล้วเรียนบทเรียนและทดลองใน Lab</p>
        </div>
        <div className="course-heading-actions">
          <label className="search-field">
            <input aria-label="ค้นหาคอร์ส" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาคอร์ส..." />
          </label>
        </div>
      </div>
      <CourseTabs active="courses" />
      {error && <div className="validation-message" role="alert">{error}</div>}
      {loading && <p className="muted small" role="status">กำลังโหลด...</p>}
      <div className="course-catalog-grid">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
      {!loading && !error && !courses.length && (
        <Empty icon={BookOpen} title="ไม่พบคอร์ส">
          ยังไม่มีคอร์สที่เผยแพร่ในตอนนี้ {COMING_LATER} ลองเปลี่ยนคำค้น หรือรอผู้สอนเผยแพร่คอร์สใหม่
        </Empty>
      )}
    </div>
  );
}

function CourseView({ courseId }: { courseId: string }) {
  const { user } = useAuth();
  const course = useLoaded(() => getCourse(courseId), 'โหลดคอร์สไม่สำเร็จ');
  const lessons = useLoaded(() => listLessons(courseId), 'โหลดบทเรียนไม่สำเร็จ');
  if (course.loading) return <div className="page"><p className="muted small" role="status">กำลังโหลด...</p></div>;
  const found = course.data;
  if (!found) {
    return (
      <div className="page">
        <Empty
          icon={BookOpen}
          title="ไม่พบคอร์ส"
          action={
            <Link className="btn primary" to="/courses">
              กลับไปรายการคอร์ส
            </Link>
          }
        >
          {course.error ?? `คอร์สนี้ยังไม่เผยแพร่หรือไม่มีอยู่ (${COMING_LATER})`}
        </Empty>
      </div>
    );
  }
  const canRead = found.enrolled || found.canManage;
  const [statusLabel, tone] = COURSE_STATUS[found.status];
  return (
    <div className="page">
      <Link className="back-link" to="/courses">
        <ArrowLeft size={15} />
        Courses
      </Link>
      <div className="page-heading">
        <div>
          <h1>{found.title}</h1>
          <p>{found.description}</p>
        </div>
        <div className="course-heading-actions">
          <Badge tone={tone}>{statusLabel}</Badge>
          {found.canManage && (
            <Link className="btn secondary" to={`/teach/${found.id}`}>
              <Pencil size={14} />
              จัดการคอร์ส
            </Link>
          )}
          {!canRead && found.status === 'published' && <Button disabled title={COMING_LATER}>ลงทะเบียนเรียน</Button>}
        </div>
      </div>
      {found.status === 'archived' && <div className="notice">คอร์สนี้ถูกเก็บถาวร อ่านย้อนหลังได้แต่ส่งงานไม่ได้</div>}
      {!canRead && (
        <div className="notice">
          <LockKeyhole size={14} /> ลงทะเบียนเพื่อเปิดเนื้อหาเต็มและ Lab ของแต่ละบทเรียน{!user && ' (ต้องเข้าสู่ระบบก่อน)'}
        </div>
      )}
      <section className="panel course-lesson-list">
        <div className="section-title">
          <div>
            <h2>บทเรียนในคอร์ส</h2>
            <p>
              {lessons.data?.length ?? 0} บทเรียน · ผู้สอน {found.ownerName || 'VIPER'}
            </p>
          </div>
        </div>
        {(lessons.data ?? []).map((lesson) => (
          <div className="management-row" key={lesson.id}>
            <div className={cx('course-icon', lesson.color)}>{canRead ? <BookOpen size={20} /> : <LockKeyhole size={19} />}</div>
            <div>
              <h3>
                {lesson.position}. {lesson.title}
              </h3>
              <p>
                {lesson.subtitle || 'ยังไม่มีคำโปรย'} · {lesson.minutes} นาที · {lesson.level}
              </p>
            </div>
            {canRead ? (
              <Link className="btn secondary" to={`/lessons/${lesson.id}`}>
                เปิดบทเรียน
                <ArrowRight size={14} />
              </Link>
            ) : (
              <Badge>ล็อก</Badge>
            )}
          </div>
        ))}
        {!lessons.loading && !lessons.data?.length && <p className="muted small">ผู้สอนยังไม่ได้เพิ่มบทเรียน</p>}
      </section>
    </div>
  );
}

// /courses/:courseId
export function CourseRoute() {
  const { courseId = '' } = useParams();
  return <CourseView key={courseId} courseId={courseId} />;
}

function LessonView({ lessonId }: { lessonId: string }) {
  const lesson = useLoaded(() => getLesson(lessonId), 'โหลดบทเรียนไม่สำเร็จ');
  if (lesson.loading) return <div className="page"><p className="muted small" role="status">กำลังโหลด...</p></div>;
  const found = lesson.data;
  if (!found) {
    return (
      <div className="page">
        <Empty
          icon={LockKeyhole}
          title="ต้องลงทะเบียนก่อนเปิดบทเรียน"
          action={
            <Link className="btn primary" to="/courses">
              ไปที่รายการคอร์ส
            </Link>
          }
        >
          {lesson.error ?? `เนื้อหาเต็มและ Lab เปิดให้ผู้ที่ลงทะเบียนในคอร์สนี้เท่านั้น (${COMING_LATER})`}
        </Empty>
      </div>
    );
  }
  return (
    <div className="page">
      <Link className="back-link" to={`/courses/${found.courseId}`}>
        <ArrowLeft size={15} />
        กลับไปที่คอร์ส
      </Link>
      <div className="lesson-page-layout">
        <div className="lesson-content">
          <div className="page-heading">
            <div>
              <h1>{found.title}</h1>
              <p>{found.subtitle}</p>
            </div>
          </div>
          <section className="panel lesson-reading">
            <Badge tone="blue">
              เนื้อหาบทเรียน · {found.minutes} นาที · {found.level}
            </Badge>
            {found.contentMd.trim() ? <Markdown text={found.contentMd} /> : <p className="muted">ผู้สอนยังไม่ได้เขียนเนื้อหา</p>}
          </section>
          {found.activity && (
            <section className="panel lesson-reading">
              <Badge tone="blue">Guided Lab · ทดลองและส่งงาน</Badge>
              <h2>{found.activity.title || 'โจทย์ของบทนี้'}</h2>
              <p style={{ whiteSpace: 'pre-wrap' }}>{found.activity.instructions}</p>
              <div className="course-heading-actions">
                <Button disabled title={COMING_LATER}>
                  <Play size={16} />
                  เปิด Lab ของบทนี้
                  <ArrowRight size={15} />
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// /lessons/:lessonId (view assignment ของ mockup คือหน้าเดียวกัน)
export function LessonRoute() {
  const { lessonId = '' } = useParams();
  return <LessonView key={lessonId} lessonId={lessonId} />;
}
