// src/components/TemplateContextMenu.tsx
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TemplateInfo } from '../lib/templateInfo';

type TemplateContextMenuProps = {
  x: number;
  y: number;
  template: TemplateInfo;
  onClose: () => void;

  onLoadTemplate?: (template: TemplateInfo) => void;

  currentLang: 'en' | 'th';
};

const TemplateContextMenu: React.FC<TemplateContextMenuProps> = ({
  x,
  y,
  template,
  onClose,
  onLoadTemplate,
  currentLang
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const menuWidth = 260;
  const menuHeight = 150; 

  const safeX = Math.min(x, viewportWidth - menuWidth - 8);
  const safeY = Math.min(y, viewportHeight - menuHeight - 8);

  const content = (
    <div
      ref={menuRef}
      style={{ top: safeY, left: safeX }}
      className="fixed z-[9999] bg-slate-900/98 border border-slate-700 rounded-lg shadow-2xl w-64 text-xs text-slate-200 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 border-b border-slate-700 bg-slate-900/90">
        <div className="text-[11px] font-semibold text-teal-300 truncate">
          {template.name}
        </div>
        {template.descriptor && (
          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
            {template.descriptor[currentLang] || template.description}
          </div>
        )}
      </div>

      <div className="py-1">

        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-teal-600/20 hover:text-teal-300 transition-colors"
          onClick={() => {
            onLoadTemplate?.(template);
            onClose();
          }}
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-teal-500/20 text-teal-300 text-[10px]">
            ▶
          </span>
          <span>Load this template</span>
        </button>

        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-700/60 transition-colors"
          onClick={() => {
            alert(
              `Template: ${template.name}\n\nDescription:\n${template.descriptor?.[currentLang] || '-'}`
            );
            onClose();
          }}
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-500/20 text-slate-300 text-[10px]">
            i
          </span>
          <span>Quick preview</span>
        </button>

        <div className="my-1 border-t border-slate-700" />

        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 transition-colors"
          onClick={onClose}
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-600/30 text-slate-300 text-[10px]">
            ✕
          </span>
          <span>Cancel</span>
        </button>

      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default TemplateContextMenu;