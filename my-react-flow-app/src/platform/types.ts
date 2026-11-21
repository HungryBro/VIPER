// type ข้อมูลระบบเรียนรู้ (คอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ การแจ้งเตือน) T18
// โครงตรงกับข้อมูลใน mockup v2 (outputs/viper-learning-v2/src/platform.mjs) แต่ id เป็น string ทั้งหมด
// และเวลาเป็น ISO string; ใช้ผ่าน src/lib/learningApi.ts เท่านั้น (ดูหมายเหตุในไฟล์นั้น)

export type CourseStatus = 'draft' | 'published' | 'archived';

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
export type AutoCheckItem = { label: string; ok?: boolean; passed?: boolean; value?: number; target?: number; op?: string };
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
  // สรุปค่าที่ผู้เรียนตั้ง และตัวชี้วัดเป็นเปอร์เซ็นต์ เรียงตาม metricLabels ของ pipeline
  result: { settings: string; metrics: number[] };
  autoCheck: AutoCheck | null;
  // Workflow ณ เวลาที่ส่ง
  nodes: Array<{ id: string; label: string }>;
  reflection: string;
  hints: number;
};

export type RubricScores = number[];

export type Review = {
  submissionId: string;
  // คะแนนรวม 0-100 = ผลรวม rubric
  score: number;
  rubric: RubricScores;
  feedback: string;
  at: string;
  reviewerId: string;
  reviewerName: string;
};

// เกณฑ์ให้คะแนนย่อย [ชื่อเกณฑ์, คะแนนเต็ม] ตาม RUBRIC ของ mockup (รวม 100)
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
