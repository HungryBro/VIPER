// หน้า Submissions (T20) ย้ายจาก SubmissionsHub / LearningHistory / Reviews / Gradebook / SubmissionDetail ของ mockup v2
// route: /submissions (?tab=grades) ข้อมูลมาจาก src/lib/learningApi.ts เท่านั้น (ตอนนี้ว่างทั้งหมด)
// ฝั่งที่แสดงเลือกจาก URL แบบ view ของ mockup ไม่ใช่จากบทบาทอย่างเดียว:
//   ?side=mine หรือผู้ที่ไม่มีสิทธิ์ผู้สอน = ฝั่งผู้เรียน (My Submissions + Grades ของตัวเอง)
//   ไม่มี side และเป็นผู้สอน/ผู้ดูแล (can_teach หรือ admin) = ฝั่งตรวจงาน (Submissions + Grades ของผู้เรียน)
// ผู้สอนที่ลงทะเบียนเรียนด้วยจึงมีเมนู Submissions และ My Submissions ที่เปิดคนละฝั่งได้ (permissions.ts)
// แบบฟอร์มให้คะแนนไม่เปิดใช้ (ว่างตามแผน) เพราะยังไม่มีระบบรับคะแนน
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, FileText, MousePointer2, Play } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { listGrades, listReviews, listSubmissions } from '../../lib/learningApi';
import { canTeach, isAdmin } from '../permissions';
import { RUBRIC, type GradeRow, type LearningScope, type Review, type Submission } from '../types';
import { useLoaded } from '../useLoaded';
import { Badge, Button, Empty, cx, time } from '../ui';

const COMING_LATER = 'ระบบคอร์สจะเพิ่มภายหลัง';

type Tab = 'work' | 'grades';

function Switcher({ teacherSide, tab, onChange }: { teacherSide: boolean; tab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: Array<[Tab, string]> = [
    ['work', teacherSide ? 'Submissions' : 'My Submissions'],
    ['grades', 'Grades'],
  ];
  return (
    <div className="tabs submissions-hub-tabs" role="group" aria-label="งานที่ส่งและคะแนน">
      {tabs.map(([id, label]) => (
        <button key={id} type="button" className={tab === id ? 'active' : ''} aria-pressed={tab === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const reviewTone = (review: Review | undefined) => (review ? 'teal' : 'blue');

// ผลตรวจตาม submissionId สร้างครั้งเดียวต่อชุดข้อมูล (ไม่ค้นแบบ find ทุกแถว)
function useReviewIndex(reviews: Review[] | undefined) {
  return useMemo(() => {
    const index = new Map((reviews ?? []).map((review) => [review.submissionId, review] as const));
    return (submissionId: string) => index.get(submissionId);
  }, [reviews]);
}
const reviewLabel = (review: Review | undefined, pending: string) => (review ? 'ตรวจแล้ว' : pending);

function SubmissionDetail({ submission, review, teacher = false }: { submission: Submission; review?: Review; teacher?: boolean }) {
  return (
    <>
      <div className="section-title">
        <h2>{submission.lessonTitle}</h2>
        <Badge tone={reviewTone(review)}>{reviewLabel(review, 'รอผู้สอนตรวจ')}</Badge>
      </div>
      <p className="muted small">
        ส่งเมื่อ {time(submission.at)} · {submission.nodes.length} โหนด · ส่งกับโจทย์ v{submission.activityVersion}
        {teacher && ` · ขอคำใบ้ ${submission.hints} ครั้ง`}
      </p>
      <div className="submission-metrics">
        {submission.result.metrics.map((value, index) => (
          <span key={index}>
            {submission.result.metricLabels?.[index] ?? `ตัวชี้วัด ${index + 1}`}
            <strong>{value.toFixed(1)}%</strong>
          </span>
        ))}
      </div>
      {submission.reflection && <p>{submission.reflection}</p>}
      {review && (
        <section>
          <h3>
            คะแนน {review.score}/100 · ฟีดแบคจาก {review.reviewerName}
          </h3>
          <p>{review.feedback}</p>
        </section>
      )}
    </>
  );
}

function LessonFilter({ label, value, options, onChange }: { label: string; value: string; options: Submission[]; onChange: (value: string) => void }) {
  const lessons = [...new Map(options.map((item) => [item.lessonId, item.lessonTitle])).entries()];
  return (
    <label className="field history-lesson-filter">
      บทเรียน
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">ทุกบทเรียน</option>
        {lessons.map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

// My Submissions (ผู้เรียน)
function LearningHistory({ switcher }: { switcher: React.ReactNode }) {
  const submissions = useLoaded(() => listSubmissions('mine'), 'โหลดงานที่ส่งไม่สำเร็จ');
  const reviews = useLoaded(() => listReviews('mine'), 'โหลดผลตรวจไม่สำเร็จ');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lessonFilter, setLessonFilter] = useState('all');
  // หน้าแรกของรายการ (data.next ใช้ต่อเมื่อมีระบบส่งงาน)
  const own = submissions.data?.items ?? [];
  const reviewOf = useReviewIndex(reviews.data?.items);
  const items = own.filter((item) => lessonFilter === 'all' || item.lessonId === lessonFilter);
  const selected = items.find((item) => item.id === selectedId);
  const error = submissions.error ?? reviews.error;
  return (
    <div className="submission-hub-content">
      <div className="page-heading">
        <div>
          <h1>My Submissions</h1>
          <p>ย้อนดูงานที่ส่งและฟีดแบคจากผู้สอน</p>
        </div>
        <Badge>{items.length} งานที่ส่ง</Badge>
      </div>
      <div className="submission-view-toolbar">
        <LessonFilter
          label="กรองงานของฉันตามบทเรียน"
          value={lessonFilter}
          options={own}
          onChange={(value) => {
            setLessonFilter(value);
            setSelectedId(null);
          }}
        />
        {switcher}
      </div>
      {error && <div className="validation-message" role="alert">{error}</div>}
      {!error && submissions.loading && <p className="muted small" role="status">กำลังโหลด...</p>}
      {!error && !submissions.loading && !items.length && (
        <Empty
          icon={FileText}
          title={lessonFilter === 'all' ? 'ยังไม่มีงานที่ส่ง' : 'ยังไม่มีงานที่ส่งในบทนี้'}
          action={
            <Link className="btn primary" to="/courses">
              <Play size={15} />
              ไปที่ Courses
            </Link>
          }
        >
          {COMING_LATER} เมื่อพร้อมแล้ว ลงทะเบียนคอร์ส ทำ Lab ให้ผ่านเกณฑ์ เขียนข้อสังเกต แล้วส่งงานจากแผงโจทย์
        </Empty>
      )}
      {items.length > 0 && (
        <div className="history-layout">
          <div className="submission-list">
            {items.map((item) => (
              <button type="button" key={item.id} className={cx('submission-card panel', selectedId === item.id && 'selected')} onClick={() => setSelectedId(item.id)}>
                <div className="course-icon blue">
                  <FileText size={21} />
                </div>
                <div>
                  <strong>{item.lessonTitle}</strong>
                  <p>{item.result.settings}</p>
                  <small>ส่งเมื่อ {time(item.at)}</small>
                </div>
                <Badge tone={reviewTone(reviewOf(item.id))}>{reviewLabel(reviewOf(item.id), 'รอตรวจ')}</Badge>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          <section className="panel submission-detail">
            {selected ? (
              <SubmissionDetail submission={selected} review={reviewOf(selected.id)} />
            ) : (
              <Empty icon={MousePointer2} title="เลือกงานเพื่อดูรายละเอียด">
                ผลลัพธ์ ข้อสังเกต และฟีดแบคจะแสดงในส่วนนี้
              </Empty>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// Submissions ฝั่งผู้สอน (Reviews) พร้อมแบบฟอร์มให้คะแนน (ไม่เปิดใช้)
function Reviews({ switcher }: { switcher: React.ReactNode }) {
  const submissions = useLoaded(() => listSubmissions('teaching'), 'โหลดงานที่ส่งไม่สำเร็จ');
  const reviews = useLoaded(() => listReviews('teaching'), 'โหลดผลตรวจไม่สำเร็จ');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [lessonFilter, setLessonFilter] = useState('all');
  const all = submissions.data?.items ?? [];
  const reviewOf = useReviewIndex(reviews.data?.items);
  const items = all.filter(
    (item) =>
      (lessonFilter === 'all' || item.lessonId === lessonFilter) &&
      (filter === 'all' || (filter === 'pending' ? !reviewOf(item.id) : !!reviewOf(item.id))),
  );
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const error = submissions.error ?? reviews.error;
  const filters: Array<['all' | 'pending' | 'reviewed', string]> = [
    ['all', 'ทั้งหมด'],
    ['pending', 'รอตรวจ'],
    ['reviewed', 'ตรวจแล้ว'],
  ];
  return (
    <div className="submission-hub-content">
      <div className="page-heading">
        <div>
          <h1>Submissions</h1>
          <p>ตรวจ Workflow และผลที่ผู้เรียนในคอร์สของคุณส่ง พร้อมให้คะแนนและฟีดแบค · เรียงงานล่าสุดก่อน</p>
        </div>
      </div>
      <div className="review-controls">
        <div className="tabs review-filter" role="group" aria-label="กรองสถานะการตรวจ">
          {filters.map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="submission-view-toolbar">
        <LessonFilter label="กรองงานตามบทเรียน" value={lessonFilter} options={all} onChange={setLessonFilter} />
        {switcher}
      </div>
      {error && <div className="validation-message" role="alert">{error}</div>}
      {!error && submissions.loading && <p className="muted small" role="status">กำลังโหลด...</p>}
      {!error && !submissions.loading && !all.length && (
        <Empty icon={FileText} title="ยังไม่มีงานให้ตรวจ">
          เมื่อผู้เรียนที่ลงทะเบียนในคอร์สของคุณส่งงาน งานจะปรากฏที่นี่ ({COMING_LATER})
        </Empty>
      )}
      {all.length > 0 && (
        <div className="review-layout">
          <aside className="panel review-list">
            {items.length ? (
              items.map((item) => (
                <button type="button" className={selected?.id === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)} key={item.id}>
                  <strong>{item.learnerName}</strong>
                  <span>{item.lessonTitle}</span>
                  <small>{time(item.at)}</small>
                  <Badge tone={reviewTone(reviewOf(item.id))}>{reviewLabel(reviewOf(item.id), 'รอตรวจ')}</Badge>
                </button>
              ))
            ) : (
              <p className="muted small">ไม่มีงานที่ตรงกับบทเรียนและสถานะที่เลือก</p>
            )}
          </aside>
          {selected && (
            <>
              <section className="panel review-snapshot">
                <h2>งานของ {selected.learnerName}</h2>
                <SubmissionDetail submission={selected} review={reviewOf(selected.id)} teacher />
                <h3>Workflow ณ เวลาที่ส่ง</h3>
                <div className="snapshot-nodes">
                  {selected.nodes.map((node) => (
                    <span key={node.id}>{node.label}</span>
                  ))}
                </div>
              </section>
              <form className="panel review-form" onSubmit={(event) => event.preventDefault()}>
                <h2>ให้คะแนนและฟีดแบค</h2>
                {/* เกณฑ์มาจากผลตรวจเอง (มีชื่อและคะแนนเต็ม) ถ้ายังไม่ตรวจใช้ RUBRIC ตั้งต้น */}
                {(reviewOf(selected.id)?.rubric ?? RUBRIC.map(([label, max]) => ({ label, max, score: null }))).map(
                  ({ label, max, score }) => (
                    <label className="field" key={label}>
                      {label} (เต็ม {max})
                      <input type="number" min={0} max={max} value={score ?? ''} disabled readOnly />
                    </label>
                  ),
                )}
                <label className="field">
                  ฟีดแบค
                  <textarea rows={4} value={reviewOf(selected.id)?.feedback ?? ''} disabled readOnly />
                </label>
                <Button disabled title={COMING_LATER}>
                  บันทึกผลตรวจ
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Grades: ผู้เรียน = ของตัวเอง, ผู้สอน = ผู้เรียนทุกคนในคอร์สที่สอน
function Gradebook({ scope, switcher }: { scope: LearningScope; switcher: React.ReactNode }) {
  const teacher = scope === 'teaching';
  const grades = useLoaded(() => listGrades(scope), 'โหลดคะแนนไม่สำเร็จ');
  const [lessonFilter, setLessonFilter] = useState('all');
  const all: GradeRow[] = grades.data?.items ?? [];
  const lessons = [...new Map(all.map((row) => [row.lessonId, row.lessonTitle])).entries()];
  const rows = all.filter((row) => lessonFilter === 'all' || row.lessonId === lessonFilter);
  return (
    <div className="submission-hub-content">
      <div className="page-heading">
        <div>
          <h1>Grades</h1>
          <p>{teacher ? 'คะแนนของผู้เรียนที่ลงทะเบียนในคอร์สของคุณ' : 'ดูคะแนนและฟีดแบคจากผู้สอน แยกตามบทเรียน'}</p>
        </div>
      </div>
      <div className="submission-view-toolbar">
        <label className="field history-lesson-filter">
          บทเรียน
          <select aria-label="กรองคะแนนตามบทเรียน" value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}>
            <option value="all">ทุกบทเรียน</option>
            {lessons.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        {switcher}
      </div>
      {grades.error && <div className="validation-message" role="alert">{grades.error}</div>}
      <section className="panel table-scroll">
        <table>
          <thead>
            <tr>
              {teacher && <th>ผู้เรียน</th>}
              <th>บทเรียน</th>
              <th>การส่งงาน</th>
              <th>สถานะตรวจ</th>
              <th>คะแนน</th>
              <th>ฟีดแบค</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.learnerId}-${row.lessonId}`}>
                {teacher && <td>{row.learnerName}</td>}
                <td>
                  <strong>{row.lessonTitle}</strong>
                  <small>{row.courseTitle}</small>
                </td>
                <td>{row.submission ? time(row.submission.at) : 'ยังไม่ส่ง'}</td>
                <td>
                  <Badge tone={row.review ? 'teal' : row.submission ? 'blue' : 'neutral'}>
                    {row.review ? 'ตรวจแล้ว' : row.submission ? 'รอตรวจ' : 'ยังไม่ส่ง'}
                  </Badge>
                </td>
                <td>{row.review ? `${row.review.score}/100` : '—'}</td>
                <td>{row.review?.feedback || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!grades.loading && !rows.length && (
          <Empty icon={FileText} title="ยังไม่มีคะแนน">
            {teacher ? 'คะแนนของผู้เรียนจะแสดงที่นี่เมื่อมีการส่งงานและตรวจงาน' : 'คะแนนและฟีดแบคจะแสดงที่นี่เมื่อผู้สอนตรวจงานของคุณ'} ({COMING_LATER})
          </Empty>
        )}
      </section>
    </div>
  );
}

export default function SubmissionsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const mineRequested = params.get('side') === 'mine';
  const teacherSide = !mineRequested && (canTeach(user) || isAdmin(user));
  const tab: Tab = params.get('tab') === 'grades' ? 'grades' : 'work';
  const switcher = (
    <Switcher
      teacherSide={teacherSide}
      tab={tab}
      onChange={(next) => {
        // สลับแท็บโดยคงฝั่งเดิม (side=mine) ไว้
        const query: Record<string, string> = {};
        if (mineRequested) query.side = 'mine';
        if (next === 'grades') query.tab = 'grades';
        setParams(query, { replace: true });
      }}
    />
  );
  return (
    <div className="page submissions-hub">
      {tab === 'grades' ? (
        <Gradebook scope={teacherSide ? 'teaching' : 'mine'} switcher={switcher} />
      ) : teacherSide ? (
        <Reviews switcher={switcher} />
      ) : (
        <LearningHistory switcher={switcher} />
      )}
    </div>
  );
}
