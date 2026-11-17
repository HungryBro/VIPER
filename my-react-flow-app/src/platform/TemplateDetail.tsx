// รายละเอียด template (T12) ย้ายจาก TemplateDetail ของ mockup v2 ต่อ API จริง:
// โหนดของ workflow จาก GET /api/templates/{id}, ความคิดเห็นเขียน/ลบได้ (การลบเป็นความสามารถเดิมที่ mockup ไม่มี)
import { useCallback, useEffect, useState } from 'react';
import { LogIn, Pencil, Play, Send, Trash2, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { apiUrl } from '../lib/http';
import {
  createTemplateComment,
  deleteTemplateComment,
  getPlatformTemplate,
  listTemplateComments,
  type TemplateComment,
  type TemplateDetail as TemplateDetailData,
  type TemplateSummary,
} from '../lib/templateApi';
import './styles/Templates.css';
import { Avatar, VisibilityBadge } from './TemplateBadges';
import { canManageTemplate, kindOf } from './templateAccess';
import { useToast } from './toast';
import { Badge, Button, Modal, time } from './ui';

export default function TemplateDetail({
  template,
  onClose,
  onEdit,
  onOpenLab,
}: {
  template: TemplateSummary;
  onClose: () => void;
  onEdit: (template: TemplateSummary) => void;
  onOpenLab?: (template: TemplateSummary) => void;
}) {
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TemplateDetailData | null>(null);
  const [comments, setComments] = useState<TemplateComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [full, thread] = await Promise.all([getPlatformTemplate(template.id), listTemplateComments(template.id)]);
      setDetail(full);
      setComments(thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดรายละเอียด Template ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [template.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const nodes = detail?.workflow.nodes ?? [];
  const edges = detail?.workflow.edges ?? [];
  const shown = detail ?? template;
  const commentsEnabled = template.comments_enabled;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const created = await createTemplateComment(template.id, text.trim());
      setComments((current) => [...current, created]);
      setText('');
      notify('เพิ่มความคิดเห็นแล้ว');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'เพิ่มความคิดเห็นไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: TemplateComment) => {
    setRemovingId(comment.id);
    try {
      await deleteTemplateComment(template.id, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      notify('ลบความคิดเห็นแล้ว');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ลบความคิดเห็นไม่สำเร็จ');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Modal title={template.name} onClose={onClose} wide>
      <div className="template-detail-content">
        <div className="template-detail-visual blue">
          {template.cover_url ? (
            <img className="template-cover" src={apiUrl(template.cover_url)} alt={`ปกของ ${template.name}`} />
          ) : (
            <Workflow size={48} aria-hidden="true" />
          )}
        </div>
        <div className="template-detail-meta">
          <VisibilityBadge kind={kindOf(template)} />
          <span>{template.owner.display_name}</span>
          <small>แก้ไข {time(template.updated_at)}</small>
        </div>
        <h3>คำอธิบาย</h3>
        <p className="template-full-description">{template.description || 'ไม่มีคำอธิบาย'}</p>
        <h3>โหนดใน Workflow</h3>
        {loading ? (
          <p className="muted small" role="status">กำลังโหลดโหนด...</p>
        ) : error ? (
          <p className="auth-error" role="alert">
            {error} <button type="button" className="text-btn" onClick={() => void load()}>ลองอีกครั้ง</button>
          </p>
        ) : (
          <>
            <div className="template-node-list">
              {nodes.map((node) => (
                <span key={node.id}>
                  <Workflow size={13} />
                  {node.data.label}
                </span>
              ))}
            </div>
            <p className="muted small">{nodes.length} โหนด · {edges.length} เส้นเชื่อม</p>
          </>
        )}
        {canManageTemplate(user, shown) && (
          <div className="detail-owner-tools">
            <Button
              kind="secondary"
              onClick={() => {
                onEdit(template);
              }}
            >
              <Pencil size={14} />
              แก้ไข
            </Button>
          </div>
        )}
        <div className="comments-section">
          <div className="section-title">
            <h3>
              ความคิดเห็น <Badge>{comments.length}</Badge>
            </h3>
            <Badge tone={commentsEnabled ? 'teal' : 'amber'}>
              {commentsEnabled ? 'เปิดรับความคิดเห็น' : 'ปิดรับความคิดเห็น'}
            </Badge>
          </div>
          <div className="comment-thread">
            {comments.map((comment) => (
              <article className="comment-item" key={comment.id}>
                <Avatar name={comment.author.display_name} />
                <div>
                  <header>
                    <strong>{comment.author.display_name}</strong>
                    <small>{time(comment.created_at)}</small>
                  </header>
                  <p>{comment.body}</p>
                  {comment.author_id === user?.id && (
                    <button
                      type="button"
                      className="text-btn"
                      disabled={removingId === comment.id}
                      aria-label={`ลบความคิดเห็นของคุณเมื่อ ${time(comment.created_at)}`}
                      onClick={() => void remove(comment)}
                    >
                      <Trash2 size={13} />
                      ลบ
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!loading && !comments.length && (
              <p className="muted small">ยังไม่มีความคิดเห็น คุณสามารถเขียนผลที่ทดลองหรือถามเกี่ยวกับ Workflow นี้ได้</p>
            )}
          </div>
          <form onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>ความคิดเห็นของคุณ</span>
              <textarea
                disabled={!user || !commentsEnabled}
                maxLength={2000}
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  !user
                    ? 'เข้าสู่ระบบเพื่อแสดงความคิดเห็น'
                    : commentsEnabled
                      ? 'เล่าสิ่งที่ทดลอง หรือฝากคำถามเกี่ยวกับ Workflow นี้...'
                      : 'ผู้ดูแลปิดรับความคิดเห็นใหม่ ความคิดเห็นเดิมยังอ่านได้'
                }
              />
            </label>
            {user ? (
              <Button type="submit" disabled={!commentsEnabled || !text.trim() || sending}>
                <Send size={14} />
                ส่งความคิดเห็น
              </Button>
            ) : (
              <Button type="button" onClick={() => navigate('/login')}>
                <LogIn size={14} />
                เข้าสู่ระบบเพื่อแสดงความคิดเห็น
              </Button>
            )}
          </form>
        </div>
      </div>
      <div className="modal-actions">
        <Button kind="secondary" onClick={onClose}>
          ปิด
        </Button>
        <Button onClick={() => (onOpenLab ?? (() => navigate('/lab')))(template)}>
          <Play size={15} />
          เปิดใน Lab
        </Button>
      </div>
    </Modal>
  );
}
