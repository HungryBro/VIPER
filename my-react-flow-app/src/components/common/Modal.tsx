// src/components/common/Modal.tsx
import React from 'react';

type ModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children?: React.ReactNode; 
  /** Render the content inside its parent (a node) instead of as an overlay; always visible. */
  inline?: boolean;
  /** Inline only: called when focus leaves a field, so edits apply without a Save button. */
  onCommit?: () => void;
};

const Modal: React.FC<ModalProps> = ({ open, title, onClose, children, inline, onCommit }) => {
  if (inline) {
    // The Save/Cancel row stays in the markup but is hidden: fields commit on blur.
    return (
      <div
        className="nodrag nowheel border-t-2 border-gray-700 p-3 text-left [&_.justify-end.border-t]:hidden"
        onBlur={() => { if (onCommit) setTimeout(onCommit, 0); }}
      >
        {children ?? <div className="text-sm text-gray-400">No content</div>}
      </div>
    );
  }
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 w-full max-w-md rounded-xl border border-gray-700 shadow-2xl">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-gray-100 font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white rounded px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {children ?? <div className="text-sm text-gray-400">No content</div>}
        </div>
      </div>
    </div>
  );
};

export default Modal;