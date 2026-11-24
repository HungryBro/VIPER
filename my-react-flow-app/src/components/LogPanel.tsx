// project_n2n/my-react-flow-app/src/components/LogPanel.tsx
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { ChevronDown, ChevronUp, FileText, Trash2, X } from 'lucide-react';
import type { LogEntry } from '../types';

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

const COMPACT_MOBILE_QUERY = '(max-width: 767px), (max-height: 560px) and (pointer: coarse)';
const MIN_HEIGHT = 96;
const DEFAULT_HEIGHT = 224;
const MAX_HEIGHT_RATIO = 0.6;

export default function LogPanel({ logs, onClear }: LogPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  
  const [isVisible, setIsVisible] = useState(false);
  // บนจอแคบเริ่มแบบย่อเพื่อให้ canvas มีที่
  const [isMinimized, setIsMinimized] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_MOBILE_QUERY).matches);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  
  const prevLogsLength = useRef(logs.length);

  useEffect(() => {
    if (logs.length > prevLogsLength.current) {
      setIsVisible(true);
      
    }
    
    if (isVisible && !isMinimized) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prevLogsLength.current = logs.length;
  }, [logs, isVisible, isMinimized]);

  // ลากขอบบนเพื่อปรับความสูง (ค่าไม่ถูกจำข้าม reload)
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight * MAX_HEIGHT_RATIO);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const onMove = (e: PointerEvent) => {
      setHeight(Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + startY - e.clientY)));
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  if (!isVisible) return null;

  return (
    <div
      className="viper-log-panel relative z-10 flex shrink-0 flex-col overflow-hidden border-t border-[var(--lab-line)] bg-[var(--lab-panel)] text-xs text-[var(--lab-ink)]"
      style={{ height: isMinimized ? 39 : height }}
    >
      {!isMinimized && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="ปรับความสูง System Logs"
          onPointerDown={startResize}
          className="viper-log-resize group absolute inset-x-0 top-0 z-10 flex h-2 cursor-row-resize touch-none items-start justify-center"
        >
          <span className="mt-px h-[3px] w-10 rounded-full bg-[var(--lab-line)] group-hover:bg-[var(--lab-blue)]" />
        </div>
      )}

      <div className="flex h-[39px] shrink-0 select-none items-center justify-between border-b border-[var(--lab-line)] pl-3 pr-2">
        <div role="tablist" className="flex h-full items-center">
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="flex h-full items-center gap-1.5 border-b-2 border-[var(--lab-blue)] px-2 text-xs font-semibold text-[var(--lab-blue-ink)]"
          >
            <FileText size={14} aria-hidden="true" />
            บันทึกการทดลอง
            <span className="rounded-full bg-[var(--lab-subtle)] px-1.5 text-[10px] font-medium text-[var(--lab-muted)]" title="System Logs">{logs.length}</span>
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={onClear}
            title="Clear logs"
            aria-label="Clear logs"
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--lab-muted)] transition hover:bg-[var(--lab-subtle)] hover:text-[var(--lab-danger)]"
          >
            <Trash2 size={14} />
          </button>

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "Expand" : "Minimize"}
            aria-label={isMinimized ? "Expand" : "Minimize"}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--lab-muted)] transition hover:bg-[var(--lab-subtle)] hover:text-[var(--lab-ink)]"
          >
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          <button
            onClick={() => setIsVisible(false)}
            title="Close panel"
            aria-label="Close panel"
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--lab-muted)] transition hover:bg-[var(--lab-subtle)] hover:text-[var(--lab-ink)]"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex-1 space-y-0.5 overflow-y-auto p-2 font-mono">
          {logs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center italic text-[var(--lab-muted)] opacity-60">
              <span>No logs available</span>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="group flex items-start gap-2 rounded p-1.5 transition hover:bg-[var(--lab-subtle)]">
                <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full
                  ${log.type === 'error' ? 'bg-[var(--lab-danger)]' :
                    log.type === 'success' ? 'bg-[var(--lab-teal)]' :
                    log.type === 'warning' ? 'bg-[var(--lab-amber)]' :
                    'bg-[var(--lab-blue)]'}`}
                />

                <div className="flex-1 break-words leading-tight">
                  <span className="mr-2 select-none text-[var(--lab-muted)]">[{log.timestamp}]</span>
                  <span className={
                    log.type === 'error' ? 'text-[var(--lab-danger)]' :
                    log.type === 'success' ? 'text-[var(--lab-teal)]' :
                    log.type === 'warning' ? 'text-[var(--lab-amber)]' :
                    'text-[var(--lab-ink)]'}>
                    {log.message}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
