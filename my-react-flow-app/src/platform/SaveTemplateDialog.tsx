// บันทึก Workflow ใน Lab เป็น Template (C-12) ย้ายจาก SaveTemplateDialog ของ mockup ต่อ createPlatformTemplate
// (log template.create) ไม่ย้ายช่องผูกบทเรียน; Official แสดงเฉพาะ admin/ผู้สอน
// /lab อยู่นอก Layout ของแพลตฟอร์ม จึงห่อด้วย .viper-platform เองเพื่อให้ Modal มีสไตล์
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileJson, Globe2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import './styles/index.css';
import './styles/SaveTemplate.css';
import { createPlatformTemplate, uploadTemplateCover, type CurrentWorkflow } from '../lib/templateApi';
import { canTeach, isAdmin } from './permissions';
import SaveTemplateCover, { useCoverPick } from './SaveTemplateCover';
import { usePlatformTheme } from './theme';
import { Button, Modal } from './ui';

type Choice = 'private' | 'public' | 'official';

const CHOICES: Array<{ value: Choice; label: string; hint: string; Icon: typeof Globe2 }> = [
  { value: 'private', label: 'Private', hint: 'เห็นเฉพาะคุณ', Icon: LockKeyhole },
  { value: 'public', label: 'Public', hint: 'ทุกคนเห็นในหน้า Templates', Icon: Globe2 },
  { value: 'official', label: 'Official', hint: 'ผู้สอน / แอดมินเท่านั้น', Icon: ShieldCheck },
];

const StepTitle = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <>
    <span className="save-template-step" aria-hidden="true">{n}</span>
    {children}
  </>
);

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
  const [coverFailure, setCoverFailure] = useState('');
  const cover = useCoverPick();
  const officialAllowed = isAdmin(user) || canTeach(user);
  const empty = !current || current.workflow.nodes.length === 0;
  const summary = current
    ? [
        current.name,
        `${current.workflow.nodes.length} โหนด`,
        ...(current.workflow.edges ? [`${current.workflow.edges.length} เส้นเชื่อม`] : []),
      ].join(' · ')
    : undefined;

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
      // Template บันทึกแล้ว ณ จุดนี้: ภาพปกที่อัปโหลดไม่สำเร็จรายงานแยก ไม่ถือว่าการบันทึกล้มเหลว
      if (cover.picked) {
        try {
          await uploadTemplateCover(saved.id, cover.picked.file);
        } catch (err) {
          setCoverFailure(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
        }
      }
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
      <Modal title="บันทึกเป็น Template" subtitle={savedName === null ? summary : undefined} onClose={onClose} wide>
        {savedName !== null ? (
          <>
            <div className="modal-body" role="status">
              <p>
                บันทึก Template <strong>{savedName}</strong> แล้ว
              </p>
              {coverFailure && (
                <p className="save-template-check save-template-warn">
                  แต่ใส่ภาพปกไม่สำเร็จ: {coverFailure} แก้ได้ที่หน้า Templates
                </p>
              )}
              <p>
                ดูได้ในแท็บ "ของฉัน" ที่หน้า <Link to="/templates" onClick={onClose}>Templates</Link>
              </p>
            </div>
            <div className="modal-actions">
              <Button onClick={onClose} autoFocus>ปิด</Button>
            </div>
          </>
        ) : (
          <form
            className="save-template-form"
            onSubmit={(event) => void submit(event)}
            // ไฟล์ที่ลากพลาดนอกกล่องภาพปกต้องไม่ทำให้เบราว์เซอร์เปิดไฟล์แทนหน้า Lab
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
          >
            <div className="modal-body save-template-body">
              <section className="save-template-section" aria-labelledby="save-template-info">
                <h3 id="save-template-info" className="save-template-title">
                  <StepTitle n={1}>ข้อมูล Template</StepTitle>
                </h3>
                <div className="field">
                  <span className="save-template-label">
                    <label htmlFor="save-template-name">ชื่อ Template</label>
                    <span id="save-template-name-count" className="muted">{name.length} / 160</span>
                  </span>
                  <input
                    id="save-template-name"
                    aria-describedby="save-template-name-count"
                    required
                    maxLength={160}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="field">
                  <span className="save-template-label">
                    <label htmlFor="save-template-description">
                      คำอธิบาย <span className="muted">(ไม่บังคับ)</span>
                    </label>
                    <span id="save-template-description-count" className="muted">{description.length} / 2000</span>
                  </span>
                  <textarea
                    id="save-template-description"
                    aria-describedby="save-template-description-count"
                    maxLength={2000}
                    rows={4}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="อธิบายวัตถุประสงค์ วิธีใช้ และสิ่งที่ควรทดลองต่อ"
                  />
                </div>
              </section>

              <section className="save-template-section" aria-labelledby="save-template-cover">
                <h3 id="save-template-cover" className="save-template-title">
                  <StepTitle n={2}>
                    ภาพปก <span className="muted">(ไม่บังคับ)</span>
                  </StepTitle>
                </h3>
                <SaveTemplateCover {...cover} />
              </section>

              <section className="save-template-section">
                <fieldset className="visibility-options save-template-visibility">
                  <legend className="save-template-title">
                    <StepTitle n={3}>ใครเห็น Template นี้ได้</StepTitle>
                  </legend>
                  <div className="save-template-cards">
                    {CHOICES.filter((item) => item.value !== 'official' || officialAllowed).map(({ value, label, hint, Icon }) => (
                      <label key={value}>
                        <input type="radio" name="save-visibility" checked={choice === value} onChange={() => setChoice(value)} />
                        <Icon size={16} aria-hidden="true" />
                        <span>
                          <strong>{label}</strong>
                          <small>{hint}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </section>

              {onSaveFile && (
                <section className="save-template-section save-template-local" aria-labelledby="save-template-local">
                  <h3 id="save-template-local" className="save-template-divider">หรือเก็บไว้ในเครื่อง</h3>
                  <div className="save-template-download">
                    <FileJson size={24} aria-hidden="true" />
                    <span>
                      <strong>ดาวน์โหลดเป็นไฟล์ .json</strong>
                      <small className="muted">ไม่ขึ้นระบบ เปิดกลับได้ด้วยปุ่ม Load บน canvas</small>
                    </span>
                    <Button kind="secondary" disabled={empty} onClick={onSaveFile}>
                      <Download size={15} />
                      ดาวน์โหลด
                    </Button>
                  </div>
                </section>
              )}
            </div>
            {(empty || error) && (
              <div className="save-template-notes">
                {empty && <p className="muted small">ยังไม่มีโหนดบน canvas จึงยังบันทึกไม่ได้</p>}
                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}
            <div className="modal-actions">
              <Button kind="secondary" type="button" onClick={onClose}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={!name.trim() || busy || empty}>
                <Save size={15} />
                {busy ? 'กำลังบันทึก…' : 'บันทึก Template'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
