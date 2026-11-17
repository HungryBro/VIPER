// File: src/routes.tsx
// route ทั้งหมดของ VIPER (React Router data mode) สร้าง router ครั้งเดียวนอก React tree
// route ที่ยังไม่ย้ายจาก mockup v2 ชี้ไปที่ NotReadyPage ไว้ก่อน task ที่รับผิดชอบจะเปลี่ยนเป็นหน้าจริง
// (ดูคอลัมน์ "route / ไฟล์ในของจริง" ใน tasks/parity.md)
import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import LabPage from './pages/LabPage';
import { NotFoundPage, NotReadyPage, RootErrorBoundary } from './pages/StatusPages';

const PLANNED_PATHS = [
  'courses',
  'courses/:courseId',
  'lessons/:lessonId',
  'teach',
  'teach/:courseId',
  'submissions',
  'announcements',
  'templates',
  'users',
  'logs',
  'profile',
  'login',
];

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    ErrorBoundary: RootErrorBoundary,
    children: [
      { index: true, Component: NotReadyPage },
      { path: 'lab', Component: LabPage },
      ...PLANNED_PATHS.map((path) => ({ path, Component: NotReadyPage })),
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
