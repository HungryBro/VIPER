// แท็บ "นำเข้า" ของ dialog Template และไฟล์ workflow: เลือก/ลากไฟล์ .json ตรวจก่อนเปิด แล้วเลือกว่าจะเปิดไว้ที่ไหน
// การอ่านและตรวจไฟล์ใช้ readWorkflowFile ตัวเดียวกับ useWorkflowFile
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, FileJson, LayoutTemplate, PlusSquare, RefreshCw, Replace, Upload } from 'lucide-react';

import { readWorkflowFile, WorkflowFileError, type ParsedWorkflow } from '../hooks/useWorkflowFile';
import { Button } from './ui';

export type ImportTarget = 'new' | 'replace';
export type ImportedWorkflow = Pick<ParsedWorkflow, 'nodes' | 'edges'> & { name: string; fileName: string };

/** สถานะไฟล์ที่เลือกอยู่ที่ dialog จึงยังอยู่เมื่อสลับแท็บ */
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkflowImport() {
  const [imported, setImported] = useState<ImportedWorkflow | null>(null);
  const [problem, setProblem] = useState('');
  const latest = useRef(0);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const ticket = ++latest.current;
    // ระหว่างอ่าน และเมื่ออ่านไม่ได้ ต้องไม่มีไฟล์เก่าค้างให้กดนำเข้า
    setImported(null);
    setProblem('');
    try {
      const { name, nodes, edges } = await readWorkflowFile(file);
      if (ticket !== latest.current) return;
      setImported({ name: name ?? (file.name.replace(/\.json$/i, '') || 'workflow'), fileName: file.name, nodes, edges });
    } catch (err) {
      if (ticket !== latest.current) return;
      console.error('Failed to load workflow file:', err);
      const reason = err instanceof WorkflowFileError ? err.message : 'ไฟล์ไม่ถูกต้องหรือเสียหาย';
      setProblem(`เปิด ${file.name} ไม่ได้: ${reason}`);
    }
  };

  return { imported, problem, pick };
}

export default function ImportWorkflowPanel({
  importer: { imported, problem, pick },
  target,
  onTargetChange,
  currentNodes,
  onClose,
}: {
  importer: ReturnType<typeof useWorkflowImport>;
  target: ImportTarget;
  onTargetChange: (target: ImportTarget) => void;
  currentNodes: number;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const hadFile = useRef(Boolean(imported));

  // กล่องที่ focus อยู่หายไปเมื่อสลับระหว่างกล่องว่างกับไฟล์ที่เลือก: ย้าย focus ไปปุ่มที่มาแทน
  useEffect(() => {
    if (hadFile.current === Boolean(imported)) return;
    hadFile.current = Boolean(imported);
    if (document.activeElement && document.activeElement !== document.body) return;
    if (imported) fileRef.current?.querySelector('button')?.focus();
    else zoneRef.current?.focus();
  }, [imported]);

  const openPicker = () => inputRef.current?.click();
  const options = [
    { value: 'new' as const, label: 'แท็บใหม่', hint: 'งานเดิมยังอยู่ครบ', Icon: PlusSquare },
    {
      value: 'replace' as const,
      label: 'แทนแท็บนี้',
      hint: currentNodes > 0 ? `โหนด ${currentNodes} ตัวในแท็บนี้จะหาย` : 'แท็บนี้ว่างอยู่',
      Icon: Replace,
    },
  ];

  return (
    <>
      <section
        className="save-template-section"
        aria-label="ไฟล์ workflow"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void pick(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="ไฟล์ workflow .json"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {imported ? (
          <div className="save-template-file" ref={fileRef}>
            <FileJson size={24} aria-hidden="true" />
            <span role="status">
              <strong>{imported.fileName}</strong>
              <small className="save-template-ok save-template-check">
                <CheckCircle2 size={14} aria-hidden="true" />
                {imported.nodes.length} โหนด · {imported.edges.length} เส้นเชื่อม
              </small>
            </span>
            <Button kind="secondary" onClick={openPicker}>
              <RefreshCw size={15} />
              เปลี่ยนไฟล์
            </Button>
          </div>
        ) : (
          <button
            ref={zoneRef}
            type="button"
            className={`save-template-dropzone save-template-filezone${dragging ? ' save-template-dragging' : ''}`}
            onClick={openPicker}
          >
            <Upload size={26} aria-hidden="true" />
            <strong>
              ลากไฟล์ .json มาวาง หรือ <span>เลือกไฟล์</span>
            </strong>
            <small>ไฟล์ที่ได้จาก 'ดาวน์โหลดเป็นไฟล์ .json' ของ VIPER</small>
          </button>
        )}
        {problem && (
          <p className="save-template-check save-template-bad" role="alert">
            <AlertTriangle size={14} aria-hidden="true" /> {problem}
          </p>
        )}
      </section>

      <section className="save-template-section">
        <fieldset className="visibility-options save-template-visibility">
          <legend className="save-template-title">เปิดไว้ที่ไหน</legend>
          <div className="save-template-cards">
            {options.map(({ value, label, hint, Icon }) => (
              <label key={value}>
                <input type="radio" name="import-target" checked={target === value} onChange={() => onTargetChange(value)} />
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

      <section className="save-template-section save-template-local">
        <h3 className="save-template-divider">หรือเลือกจากระบบ</h3>
        <Link to="/templates" onClick={onClose} className="save-template-download">
          <LayoutTemplate size={24} aria-hidden="true" />
          <span>
            <strong>เปิดจากหน้า Templates</strong>
            <small className="muted">Official, Public และของฉัน กด 'เปิดใน Lab'</small>
          </span>
          <ExternalLink size={16} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
