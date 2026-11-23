// File: src/routes.tsx
// route ทั้งหมดของ VIPER (React Router data mode) สร้าง router ครั้งเดียวนอก React tree
// route ที่ยังไม่ย้ายจาก mockup v2 ชี้ไปที่ NotReadyPage ไว้ก่อน task ที่รับผิดชอบจะเปลี่ยนเป็นหน้าจริง
// (ดูคอลัมน์ "route / ไฟล์ในของจริง" ใน tasks/parity.md)
import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import LoginPage from './components/LoginPage';
import Layout from './platform/Layout';
import CoursesPage, { CourseRoute, LessonRoute } from './platform/pages/CoursesPage';
import AnnouncementsPage from './platform/pages/AnnouncementsPage';
import HomeRoute from './platform/pages/HomeRoute';
import LogsPage from './platform/pages/LogsPage';
import ProfilePage from './platform/pages/ProfilePage';
import SubmissionsPage from './platform/pages/SubmissionsPage';
import TeachPage, { TeachCourseRoute } from './platform/pages/TeachPage';
import TemplatesPage from './platform/pages/TemplatesPage';
import UsersPage from './platform/pages/UsersPage';
import RequireAuth from './platform/RequireAuth';
import { NotFoundPage, NotReadyPage, RootErrorBoundary } from './pages/StatusPages';

// ทุก route ที่วางแผนไว้ย้ายครบแล้ว (T20) คงกลไกไว้สำหรับ route ใหม่ที่ยังไม่พร้อม
const PLANNED_PATHS: string[] = [];

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    ErrorBoundary: RootErrorBoundary,
    children: [
      // ผู้เยี่ยมชมเห็นหน้าแรก "/" และ /login เท่านั้น ทุก route อื่นอยู่ใต้ RequireAuth (พาไป /login?next=...)
      { path: 'login', Component: LoginPage },
      {
        Component: RequireAuth,
        children: [
          // /lab ไม่อยู่ใต้ Layout ของแพลตฟอร์ม: มีหัวของ editor เอง (T14 ค่อยรวม header)
          // ตัว editor render โดย LabHost ใน App.tsx เพื่อให้ค้าง mount ไว้ตอนไป route อื่น route นี้มีไว้กันสิทธิ์และจับ path
          { path: 'lab', element: null },
        ],
      },
      {
        Component: Layout,
        // F5: error ของหน้าแพลตฟอร์มแสดงในกรอบนี้แทน App ทั้งก้อน LabHost จึงยัง mount อยู่ (การตัดสินใจข้อ 9)
        ErrorBoundary: RootErrorBoundary,
        children: [
          { index: true, Component: HomeRoute },
          {
            Component: RequireAuth,
            children: [
              { path: 'users', Component: UsersPage },
              { path: 'logs', Component: LogsPage },
              { path: 'templates', Component: TemplatesPage },
              { path: 'profile', Component: ProfilePage },
              { path: 'submissions', Component: SubmissionsPage },
              { path: 'announcements', Component: AnnouncementsPage },
              { path: 'courses', Component: CoursesPage },
              { path: 'courses/:courseId', Component: CourseRoute },
              { path: 'lessons/:lessonId', Component: LessonRoute },
              { path: 'teach', Component: TeachPage },
              { path: 'teach/:courseId', Component: TeachCourseRoute },
              ...PLANNED_PATHS.map((path) => ({ path, Component: NotReadyPage })),
              { path: '*', Component: NotFoundPage },
            ],
          },
        ],
      },
    ],
  },
]);
