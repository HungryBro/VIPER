// component พื้นฐานของแพลตฟอร์ม แปลงจาก outputs/viper-learning-v2/src/ui.jsx (T5)
// ไม่ย้าย Ctx/useApp ของ mockup: ของจริงใช้ useAuth() และ router
import {
  Fragment,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Workflow, X } from 'lucide-react';

// ตัวช่วยเล็กๆ อยู่ไฟล์เดียวกับ component ตามแบบ mockup (เหมือน useAuth ใน AuthContext)
// eslint-disable-next-line react-refresh/only-export-components
export const cx = (...args: Array<string | false | null | undefined>): string => args.filter(Boolean).join(' ');

// eslint-disable-next-line react-refresh/only-export-components
export const time = (date?: string | number | Date | null): string =>
  date
    ? new Date(date).toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'ยังไม่เคยเข้าใช้งาน';

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | (string & {});

export function Button({
  children,
  kind = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind }) {
  return (
    <button type={type} className={cx('btn', kind, className)} {...props}>
      {children}
    </button>
  );
}

export type BadgeTone = 'neutral' | 'blue' | 'teal' | 'amber' | 'violet' | 'red' | (string & {});

export function Badge({ children, tone = 'neutral' }: { children?: ReactNode; tone?: BadgeTone }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Empty({
  icon: Icon = Workflow,
  title,
  children,
  action,
}: {
  icon?: ComponentType<{ size?: number }>;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

const FOCUSABLE = 'button,input,select,textarea,a[href],[tabindex="0"]';

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => !(element as HTMLButtonElement).disabled && element.getClientRects().length > 0,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!items.length) {
        event.preventDefault();
        ref.current.focus();
      } else if (!ref.current.contains(document.activeElement)) {
        // ปุ่มที่ focus อยู่ถูกถอดออกจาก dialog: ดึง focus กลับ ไม่ให้ Tab หลุดไปหน้าด้านหลัง
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={cx('modal', wide && 'wide')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          {subtitle ? (
            <div className="modal-heading">
              <h2>{title}</h2>
              <p className="muted small">{subtitle}</p>
            </div>
          ) : (
            <h2>{title}</h2>
          )}
          <button type="button" className="icon-btn" aria-label="ปิดหน้าต่าง" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

// Markdown อย่างง่าย: หัวข้อ ย่อหน้า list ตัวหนา สร้างเป็น React element ทั้งหมด ไม่ใช้ innerHTML
const inline = (text: string): ReactNode[] =>
  text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part));

type MarkdownBlock = ReactNode | { list: string[] };

export function Markdown({ text = '' }: { text?: string }) {
  const blocks: MarkdownBlock[] = [];
  let list: string[] | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={blocks.length}>
          {paragraph.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(line)}
            </Fragment>
          ))}
        </p>,
      );
      paragraph = [];
    }
  };
  String(text)
    .split('\n')
    .forEach((raw) => {
      const line = raw.trimEnd();
      if (/^\s*[-*] /.test(line)) {
        flush();
        if (!list) {
          list = [];
          blocks.push({ list });
        }
        list.push(line.replace(/^\s*[-*] /, ''));
        return;
      }
      list = null;
      if (/^#{1,3} /.test(line)) {
        flush();
        const level = (line.match(/^#+/) as RegExpMatchArray)[0].length;
        const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
        blocks.push(<Tag key={blocks.length}>{inline(line.replace(/^#+ /, ''))}</Tag>);
      } else if (!line.trim()) flush();
      else paragraph.push(line);
    });
  flush();
  return (
    <div className="markdown-body">
      {blocks.map((block, i) =>
        block && typeof block === 'object' && 'list' in block ? (
          <ul key={i}>
            {block.list.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          block
        ),
      )}
    </div>
  );
}
