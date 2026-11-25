// บันทึก Workflow ใน Lab เป็น Template (C-12) ย้ายจาก SaveTemplateDialog ของ mockup ต่อ createPlatformTemplate
// (log template.create) ไม่ย้ายช่องผูกบทเรียน; Official แสดงเฉพาะ admin/ผู้สอน
// /lab อยู่นอก Layout ของแพลตฟอร์ม จึงห่อด้วย .viper-platform เองเพื่อให้ Modal มีสไตล์
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Globe2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import './styles/index.css';
import { createPlatformTemplate, type CurrentWorkflow } from '../lib/templateApi';
import { canTeach, isAdmin } from './permissions';
import { usePlatformTheme } from './theme';
import { Button, Modal } from './ui';

type Choice = 'private' | 'public' | 'official';

export default function SaveTemplateDialog({
  getCurrentWorkflow,
  onSaveFile,
  onClose,
  onSaved,
}: {
  getCurrentWorkflow: () => CurrentWorkflow | null;
  /** ดาวน์โหลด workflow เป็นไฟล์ .json (ปุ่ม Save เดิมบน canvas ย้ายมาไว้ที่นี่) */
  onSaveFile?: () => void;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [theme] = usePlatformTheme();
  const current = getCurrentWorkflow();
  const [name, setName] = useState(current?.name ?? '');
  const [description, setDescription] = useState('');
  const [choice, setChoice] = useState<Choice>('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const officialAllowed = isAdmin(user) || canTeach(user);
  const empty = !current || current.workflow.nodes.length === 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    // อ่าน workflow ตอนกดบันทึกอีกครั้ง เพื่อให้ได้สถานะล่าสุดของ canvas
    const latest = getCurrentWorkflow();
    if (!latest || latest.workflow.nodes.length === 0) {
      setError('ยังไม่มี Workflow ที่จะบันทึก ต่อโหนดบน canvas ก่อน');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await createPlatformTemplate({
        name: name.trim(),
        description: description.trim(),
        visibility: choice === 'private' ? 'private' : 'public',
        workflow: latest.workflow,
        ...(choice === 'official' ? { is_official: true } : {}),
      });
      setSavedName(saved.name);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึก Template ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="viper-platform" data-theme={theme}>
      <Modal title="บันทึก Workflow เป็น Template" onClose={onClose}>
        {savedName !== null ? (
          <>
            <div className="modal-body" role="status">
              <p>
                บันทึก Template <strong>{savedName}</strong> แล้ว
              </p>
              <p>
                ดูได้ในแท็บ "ของฉัน" ที่หน้า <Link to="/templates" onClick={onClose}>Templates</Link>
              </p>
            </div>
            <div className="modal-actions">
              <Button onClick={onClose}>ปิด</Button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <div className="modal-body">
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
              <fieldset className="visibility-options">
                <legend>ใครเห็น Template นี้ได้</legend>
                <label>
                  <input type="radio" name="save-visibility" checked={choice === 'private'} onChange={() => setChoice('private')} />
                  <LockKeyhole size={16} />
                  <span>
                    <strong>Private</strong>
                  </span>
                </label>
                <label>
                  <input type="radio" name="save-visibility" checked={choice === 'public'} onChange={() => setChoice('public')} />
                  <Globe2 size={16} />
                  <span>
                    <strong>Public</strong>
                  </span>
                </label>
                {officialAllowed && (
                  <label>
                    <input type="radio" name="save-visibility" checked={choice === 'official'} onChange={() => setChoice('official')} />
                    <ShieldCheck size={16} />
                    <span>
                      <strong>Official</strong>
                    </span>
                  </label>
                )}
              </fieldset>
              {onSaveFile && (
                <div style={{ marginTop: 14 }}>
                  <Button kind="secondary" type="button" disabled={empty} onClick={onSaveFile}>
                    <Download size={15} />
                    บันทึกเป็นไฟล์ .json
                  </Button>
                </div>
              )}
              {empty && <p className="muted small">ยังไม่มีโหนดบน canvas จึงยังบันทึกไม่ได้</p>}
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
              <Button type="submit" disabled={!name.trim() || busy || empty}>
                <Save size={15} />
                บันทึก Template
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
