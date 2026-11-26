// หมวดของ audit log ใช้ร่วมกันระหว่างหน้า Platform Logs (/logs) และแผง Activity Logs เดิม
export type AuditCategoryKey =
  | 'login'
  | 'template'
  | 'comment'
  | 'ban'
  | 'permission'
  | 'processing'
  | 'course'
  | 'other';

// ลำดับนี้คือลำดับในช่องเลือก
export const AUDIT_CATEGORIES: ReadonlyArray<{ key: AuditCategoryKey; label: string }> = [
  { key: 'login', label: 'Login' },
  { key: 'template', label: 'Template' },
  { key: 'comment', label: 'Comment' },
  { key: 'ban', label: 'Ban' },
  { key: 'permission', label: 'Permission' },
  { key: 'processing', label: 'Processing' },
  { key: 'course', label: 'Course' },
  { key: 'other', label: 'อื่นๆ' },
];

// จัดหมวดจากชื่อ action อย่างเดียว เพราะตัวกรองฝั่ง server รับได้แค่รายชื่อ action
export function categoryOfAction(action: string): AuditCategoryKey {
  if (action.startsWith('auth.')) return 'login';
  if (action.startsWith('template.')) return 'template';
  if (action.startsWith('comment.')) return 'comment';
  if (action.startsWith('ban.') || action === 'account.ban_expired') return 'ban';
  if (action.startsWith('permission.')) return 'permission';
  if (action.startsWith('processing.')) return 'processing';
  if (action.startsWith('course.') || action.startsWith('lesson.') || action.startsWith('enrollment.')) return 'course';
  // แผง Activity Logs เดิมแยกบางแถวของ admin.user_access_updated เป็น ban ด้วย details.changes
  // แต่ตัวกรองฝั่ง server ดู details ไม่ได้ ที่นี่จึงเป็น permission ทั้ง action
  if (action === 'admin.user_access_updated' || action === 'admin.template_comments_updated') return 'permission';
  return 'other';
}
