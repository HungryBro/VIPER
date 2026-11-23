// project_n2n/my-react-flow-app/src/components/LogPanel.tsx
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
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
      className="viper-log-panel relative z-10 flex shrink-0 flex-col overflow-hidden border-t border-gray-700 bg-gray-900 font-mono text-xs"
      style={{ height: isMinimized ? 40 : height }}
    >
      {!isMinimized && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="ปรับความสูง System Logs"
          onPointerDown={startResize}
          className="viper-log-resize absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-teal-500/40"
        />
      )}

      <div className="flex justify-between items-center px-3 py-2 bg-gray-800/90 border-b border-gray-700 select-none">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 font-bold flex items-center gap-2">
            📺 System Logs
          </span>
          {logs.length > 0 && (
            <span className="bg-gray-700 text-gray-300 px-1.5 rounded-full text-[10px]">
              {logs.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={onClear}
            title="Clear logs"
            className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-700/50 transition mr-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "Expand" : "Minimize"}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition"
          >
            {isMinimized ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth={2} />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            )}
          </button>

          <button 
            onClick={() => setIsVisible(false)}
            title="Close panel"
            className="text-gray-400 hover:text-white hover:bg-red-600/80 p-1 rounded transition ml-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 italic opacity-50">
              <span>No logs available</span>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-2 items-start p-1.5 rounded hover:bg-white/5 transition group">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 
                  ${log.type === 'error' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 
                    log.type === 'success' ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]' : 
                    log.type === 'warning' ? 'bg-yellow-500' : 
                    'bg-blue-500'}`} 
                />
                
                <div className="flex-1 break-words leading-tight">
                  <span className="text-gray-500 mr-2 select-none">[{log.timestamp}]</span>
                  <span className={`
                    ${log.type === 'error' ? 'text-red-300' : 
                      log.type === 'success' ? 'text-green-300' : 
                      log.type === 'warning' ? 'text-yellow-300' : 
                      'text-gray-300'}
                  `}>
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
