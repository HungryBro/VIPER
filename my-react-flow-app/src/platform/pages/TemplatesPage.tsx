// หน้า Templates (T12) ย้ายจาก TemplateLibrary ของ mockup v2 ต่อ template จริงจาก templateApi.ts
// แท็บ Official / Public / ของฉัน (mockup เรียก Private: /api/templates/mine รวม public ของตัวเองด้วย)
// สิทธิ์ปุ่มอยู่ที่ templateAccess.ts ฝั่ง server ตรวจซ้ำทุกครั้ง; การโหลดเข้า Lab เป็นงาน T13
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, Globe2, Library, LockKeyhole, MessageSquare, Pencil, Play, Plus, Save, Search, ShieldAlert, Trash2, Workflow } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { apiUrl } from '../../lib/http';
import {
  deletePlatformTemplate,
  listMyTemplates,
  listOfficialTemplates,
  listPublicTemplates,
  updatePlatformTemplate,
  updateTemplateCommentsSetting,
  uploadTemplateCover,
  type TemplateSummary,
  type TemplateVisibility,
} from '../../lib/templateApi';
import '../styles/Templates.css';
import { canManageTemplate, canToggleComments, kindOf } from '../templateAccess';
import { Avatar, VisibilityBadge } from '../TemplateBadges';
import TemplateDetail from '../TemplateDetail';
import { useOpenInLab } from '../useOpenInLab';
import { useToast } from '../toast';
import { Button, Empty, Modal, cx, time } from '../ui';

type Tab = 'official' | 'public' | 'mine';
const TABS: Array<[Tab, string]> = [
  ['official', 'Official'],
  ['public', 'Public'],
  ['mine', 'ของฉัน'],
];

const COVER_TYPES = 'image/png,image/jpeg,image/webp';

function CommentSwitch({ template, on, onToggle }: { template: TemplateSummary; on: boolean; onToggle: () => void }) {
  return (
    <div className="comment-switch-row">
      <span>
        เปิดรับความคิดเห็น <small>ผู้ดูแลจัดการ</small>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`เปิดรับความคิดเห็น ${template.name}`}
        className={cx('toggle-switch', on && 'on')}
        onClick={onToggle}
      >
        <span />
      </button>
    </div>
  );
}

function DeleteDialog({
  template,
  onCancel,
  onDeleted,
}: {
  template: TemplateSummary;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const notify = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="ยืนยันลบ Template" onClose={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (typed !== template.name || busy) return;
          setBusy(true);
          deletePlatformTemplate(template.id)
            .then(() => {
              notify('ลบ Template แล้ว');
              onDeleted();
            })
            .catch((err) => {
              setError(err instanceof Error ? err.message : 'ลบ Template ไม่สำเร็จ');
              setBusy(false);
            });
        }}
      >
        <div className="modal-body">
          <p>พิมพ์ชื่อ Template เพื่อยืนยันการลบ</p>
          <p>
            <strong>{template.name}</strong>
          </p>
          <label className="field">
            ชื่อ Template ที่ต้องการลบ
            <input
              autoFocus
              required
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={template.name}
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <Button kind="secondary" type="button" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button type="submit" className="danger" disabled={typed !== template.name || busy}>
            <Trash2 size={15} />
            ยืนยันลบ Template
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditDialog({
  template,
  canManage,
  canComments,
  onClose,
  onSaved,
  onAskDelete,
}: {
  template: TemplateSummary;
  canManage: boolean;
  canComments: boolean;
  onClose: () => void;
  onSaved: () => void;
  onAskDelete: () => void;
}) {
  const notify = useToast();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [visibility, setVisibility] = useState<TemplateVisibility>(template.visibility);
  const [cover, setCover] = useState<File | null>(null);
  const [commentsOn, setCommentsOn] = useState(template.comments_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (canManage) {
        const changes: { name?: string; description?: string; visibility?: TemplateVisibility } = {};
        if (name.trim() !== template.name) changes.name = name.trim();
        if (description !== template.description) changes.description = description;
        if (!template.is_official && visibility !== template.visibility) changes.visibility = visibility;
        if (Object.keys(changes).length) await updatePlatformTemplate(template.id, changes);
        if (cover) await uploadTemplateCover(template.id, cover);
      }
      if (canComments && commentsOn !== template.comments_enabled) {
        await updateTemplateCommentsSetting(template.id, commentsOn);
      }
      notify('อัปเดต Template แล้ว');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึก Template ไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <Modal title="แก้ไข Template" onClose={onClose}>
      <form onSubmit={(event) => void save(event)}>
        <div className="modal-body">
          <fieldset className="template-edit-fields" disabled={!canManage}>
            <label className="field">
              ชื่อ Template
              <input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              คำอธิบาย
              <textarea
                maxLength={2000}
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="อธิบายวัตถุประสงค์ วิธีใช้ และสิ่งที่ควรทดลองต่อ"
              />
            </label>
            <label className="field">
              ภาพปก (ไม่บังคับ)
              <input
                type="file"
                accept={COVER_TYPES}
                aria-label="ภาพปก Template"
                onChange={(event) => setCover(event.target.files?.[0] ?? null)}
              />
              {template.cover_url && !cover && <small>มีภาพปกอยู่แล้ว เลือกไฟล์ใหม่เพื่อเปลี่ยน</small>}
            </label>
            {!template.is_official && (
              <fieldset className="visibility-options">
                <legend>ใครเห็น Template นี้ได้</legend>
                <label>
                  <input type="radio" name="visibility" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
                  <LockKeyhole size={16} />
                  <span>
                    <strong>Private</strong>
                  </span>
                </label>
                <label>
                  <input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
                  <Globe2 size={16} />
                  <span>
                    <strong>Public</strong>
                  </span>
                </label>
              </fieldset>
            )}
          </fieldset>
          {canComments && <CommentSwitch template={template} on={commentsOn} onToggle={() => setCommentsOn((value) => !value)} />}
          {canManage && (
            <div className="template-delete-section">
              <Button kind="secondary" type="button" className="danger" onClick={onAskDelete}>
                <Trash2 size={15} />
                ลบ Template
              </Button>
            </div>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <Button kind="secondary" type="button" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={!name.trim() || busy}>
            <Save size={15} />
            บันทึก Template
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function TemplatesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openInLab, openingId } = useOpenInLab();
  const [lists, setLists] = useState<Record<Tab, TemplateSummary[]>>({ official: [], public: [], mine: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('official');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [official, publicList, mine] = await Promise.all([listOfficialTemplates(), listPublicTemplates(), listMyTemplates()]);
      setLists({ official, public: publicList, mine });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลด Template ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const items = lists[tab].filter((template) =>
    `${template.name} ${template.description} ${template.owner.display_name}`.toLowerCase().includes(needle),
  );
  const find = (id: number | null): TemplateSummary | undefined =>
    id === null ? undefined : [...lists.official, ...lists.public, ...lists.mine].find((template) => template.id === id);
  const selected = find(selectedId);
  const editing = find(editingId);
  const deleting = find(deletingId);
  const canEditCard = (template: TemplateSummary) => canManageTemplate(user, template) || canToggleComments(user);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Templates</h1>
          <p>บันทึก แบ่งปัน และเลือก Workflow ไปทดลองต่อ</p>
        </div>
        <Button onClick={() => navigate('/lab')}>
          <Plus size={16} />
          สร้างใน Lab
        </Button>
      </div>
      <div className="filter-toolbar">
        <div className="tabs template-filters">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label} <span>{lists[id].length}</span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อ คำอธิบาย ผู้สร้าง..."
            aria-label="ค้นหา Template"
          />
        </label>
      </div>
      <div className="template-tab-note">
        <LockKeyhole size={14} />
        <span>Private แสดงเฉพาะ Template ของบัญชีคุณ · Official เป็น Workflow อ้างอิงจากผู้สอนและผู้ดูแล</span>
      </div>
      {error ? (
        <section className="panel">
          <Empty
            icon={ShieldAlert}
            title="โหลด Template ไม่สำเร็จ"
            action={<Button kind="secondary" onClick={() => void load()}>ลองอีกครั้ง</Button>}
          >
            {error}
          </Empty>
        </section>
      ) : loading ? (
        <section className="panel" role="status" aria-busy="true">
          <Empty icon={Clock3} title="กำลังโหลด Template">กรุณารอสักครู่</Empty>
        </section>
      ) : (
        <>
          <div className="course-grid">
            {items.map((template) => (
              <article key={template.id} className="template-card panel" data-template-id={template.id}>
                <button
                  type="button"
                  className="template-preview blue"
                  onClick={() => setSelectedId(template.id)}
                  aria-label={`ดูรายละเอียด ${template.name}`}
                >
                  {template.cover_url ? (
                    <img className="template-cover" src={apiUrl(template.cover_url)} alt="" />
                  ) : (
                    <Workflow size={40} aria-hidden="true" />
                  )}
                </button>
                <div className="template-body">
                  <div className="card-meta">
                    <VisibilityBadge kind={kindOf(template)} />
                    <span>แก้ไข {time(template.updated_at)}</span>
                  </div>
                  <button type="button" className="template-title-button" onClick={() => setSelectedId(template.id)}>
                    <h2>{template.name}</h2>
                  </button>
                  <p className="template-description">{template.description}</p>
                  <div className="template-author">
                    <Avatar name={template.owner.display_name} />
                    <span>
                      {template.owner.display_name}
                      {template.owner_id === user?.id && <small> · คุณ</small>}
                    </span>
                  </div>
                  <div className="template-comment-meta">
                    <button type="button" className="text-btn" onClick={() => setSelectedId(template.id)}>
                      <MessageSquare size={14} />
                      ความคิดเห็น
                    </button>
                    <span>{template.comments_enabled ? 'เปิดรับความคิดเห็น' : 'ผู้ดูแลปิดรับแล้ว'}</span>
                  </div>
                  <div className="template-actions">
                    {canEditCard(template) && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`แก้ไข ${template.name}`}
                        onClick={() => setEditingId(template.id)}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    <Button kind="secondary" onClick={() => setSelectedId(template.id)}>
                      รายละเอียด
                    </Button>
                    <Button disabled={openingId === template.id} onClick={() => void openInLab(template)}>
                      <Play size={14} />
                      เปิดใน Lab
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!items.length && (
            <Empty icon={Library} title={query ? 'ไม่พบ Template ที่ค้นหา' : 'ยังไม่มี Template ในหมวดนี้'}>
              บันทึก Workflow จาก Lab เพื่อสร้าง Template ของคุณ
            </Empty>
          )}
        </>
      )}
      {selected && (
        <TemplateDetail
          template={selected}
          onClose={() => setSelectedId(null)}
          onOpenLab={(template) => void openInLab(template)}
          onEdit={(template) => {
            setSelectedId(null);
            setEditingId(template.id);
          }}
        />
      )}
      {editing && !deleting && (
        <EditDialog
          template={editing}
          canManage={canManageTemplate(user, editing)}
          canComments={canToggleComments(user)}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            void load();
          }}
          onAskDelete={() => setDeletingId(editing.id)}
        />
      )}
      {deleting && (
        <DeleteDialog
          template={deleting}
          onCancel={() => setDeletingId(null)}
          onDeleted={() => {
            setDeletingId(null);
            setEditingId(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
