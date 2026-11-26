// type ข้อมูลระบบเรียนรู้ (คอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ การแจ้งเตือน) T18
// โครงตรงกับข้อมูลใน mockup v2 (outputs/viper-learning-v2/src/platform.mjs) แต่ id เป็น string ทั้งหมด
// และเวลาเป็น ISO string; ใช้ผ่าน src/lib/learningApi.ts เท่านั้น (ดูหมายเหตุในไฟล์นั้น)

export type CourseStatus = 'draft' | 'published' | 'archived';

// ป้ายสถานะคอร์ส [ข้อความ, tone ของ Badge] ใช้ร่วมกันที่ Courses และ Teach
// สถานะที่ไม่รู้จัก (server เพิ่มสถานะใหม่ภายหลัง) แสดงชื่อสถานะตรงๆ แทนการทำให้หน้าพัง
const COURSE_STATUS: Record<CourseStatus, readonly [string, string]> = {
  draft: ['Draft', 'amber'],
  published: ['Published', 'teal'],
  archived: ['Archived', 'neutral'],
};
export const courseStatusBadge = (status: string): readonly [string, string] =>
  COURSE_STATUS[status as CourseStatus] ?? [status, 'neutral'];

// หน้าของรายการจาก learningApi: next = cursor ของหน้าถัดไป (null = หน้าสุดท้าย)
// ส่ง cursor กลับมาใน PageQuery เพื่อขอหน้าถัดไป ตอนนี้ทุกฟังก์ชันคืนหน้าเดียวที่ว่าง
export type ListPage<T> = { items: T[]; next: string | null };
export type PageQuery = { cursor?: string | null; limit?: number };

export type Course = {
  id: string;
  ownerId: string;
  ownerName: string;
  code: string;
  title: string;
  description: string;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
  lessonCount: number;
  enrolledCount: number;
  // ผู้เรียนที่เปิดอยู่ลงทะเบียนในคอร์สนี้แล้วหรือยัง
  enrolled: boolean;
  // ผู้เปิดอยู่จัดการคอร์สนี้ได้ (เจ้าของหรือผู้ดูแล)
  canManage: boolean;
  // เหตุที่ยัง Publish ไม่ได้ server ส่งมาเฉพาะผู้จัดการคอร์ส
  publishBlockers?: string[];
};

// ผู้ลงทะเบียน (active) ของคอร์ส server ส่งให้เฉพาะเจ้าของคอร์สและผู้ดูแล
export type CourseEnrollment = {
  userId: string;
  name: string;
  email: string;
  enrolledAt: string;
};

export type LessonColor = 'blue' | 'teal' | 'violet' | (string & {});
export type LessonLevel = 'พื้นฐาน' | 'ปานกลาง' | 'ขั้นสูง';

// เกณฑ์ผ่านของโจทย์ Lab: metricIndex ชี้ตัวชี้วัดของ pipeline, op เปรียบเทียบกับ value
export type ActivityCriterion = { metricIndex: number; op: '>=' | '<='; value: number; label: string };

export type LessonActivity = {
  pipeline: string;
  title: string;
  instructions: string;
  steps: string[];
  hints: string[];
  criteria: ActivityCriterion[];
  dueAt: string | null;
  version: number;
};

// ส่วนของบทเรียนที่ผู้ยังไม่ลงทะเบียนเห็นได้ (หน้าล็อก)
export type LessonPreview = Pick<Lesson, 'id' | 'courseId' | 'title' | 'subtitle'>;

// ผลของ getLesson: null = ไม่พบหรือมองไม่เห็น (server ตอบ 404) ; locked = มีอยู่แต่ต้องลงทะเบียนก่อน (403)
export type LessonLookup = { locked: false; lesson: Lesson } | { locked: true; lesson: LessonPreview };

export type Lesson = {
  id: string;
  courseId: string;
  position: number;
  title: string;
  subtitle: string;
  // Markdown อย่างง่าย: ## หัวข้อ, - รายการ, **ตัวหนา**
  contentMd: string;
  minutes: number;
  level: LessonLevel;
  color: LessonColor;
  activity: LessonActivity | null;
};

// ผลตรวจอัตโนมัติตอนส่งงาน: structure = ตรวจโครง workflow, metrics = ตรวจตัวชี้วัดตามเกณฑ์
export type AutoCheckItem = { label: string; passed: boolean; value?: number; target?: number; op?: string };
export type AutoCheck = { structure: AutoCheckItem[]; metrics: AutoCheckItem[]; passed: boolean };

export type Submission = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  learnerId: string;
  learnerName: string;
  activityVersion: number;
  at: string;
  // สรุปค่าที่ผู้เรียนตั้ง และตัวชี้วัดเป็นเปอร์เซ็นต์ ; metricLabels[i] คือชื่อของ metrics[i] (ไม่มีจะแสดง "ตัวชี้วัด i")
  result: { settings: string; metrics: number[]; metricLabels?: string[] };
  autoCheck: AutoCheck | null;
  // Workflow ณ เวลาที่ส่ง
  nodes: Array<{ id: string; label: string }>;
  reflection: string;
  hints: number;
};

// คะแนนย่อยแต่ละเกณฑ์ มาพร้อมชื่อและคะแนนเต็มจาก server จึงไม่ผูกกับลำดับของ RUBRIC ฝั่งหน้า
export type RubricItem = { label: string; max: number; score: number };

export type Review = {
  submissionId: string;
  // คะแนนรวม 0-100 = ผลรวม rubric
  score: number;
  rubric: RubricItem[];
  feedback: string;
  at: string;
  reviewerId: string;
  reviewerName: string;
};

// เกณฑ์ให้คะแนนย่อยตั้งต้น [ชื่อเกณฑ์, คะแนนเต็ม] ตาม RUBRIC ของ mockup (รวม 100) ใช้เมื่อยังไม่มีผลตรวจที่มี rubric ของตัวเอง
export const RUBRIC: ReadonlyArray<readonly [string, number]> = [
  ['โครงสร้าง Workflow', 40],
  ['การทดลองและประเมินผล', 40],
  ['การอธิบายสิ่งที่สังเกต', 20],
];

// แถวสมุดคะแนน: ผู้เรียน x บทเรียน (submission/review เป็น null เมื่อยังไม่ส่ง/ยังไม่ตรวจ)
export type GradeRow = {
  learnerId: string;
  learnerName: string;
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  submission: Submission | null;
  review: Review | null;
};

export type Announcement = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  body: string;
  author: string;
  at: string;
};

export type PlatformNotification = {
  id: string;
  title: string;
  description: string;
  // route ปลายทางเมื่อกดการแจ้งเตือน (เช่น /submissions, /templates)
  to: string;
  at: string;
  read: boolean;
};

// ขอบเขตรายการงานที่ส่ง/คะแนน: mine = ของตัวเอง, teaching = ของผู้เรียนในคอร์สที่ตัวเองสอน (ผู้ดูแลเห็นทั้งหมด)
export type LearningScope = 'mine' | 'teaching';
