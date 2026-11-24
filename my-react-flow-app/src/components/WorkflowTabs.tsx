// src/components/WorkflowTabs.tsx
import React, { useState, useRef, useEffect } from 'react';

export interface TabSummary {
  id: string;
  name: string;
}

interface WorkflowTabsProps {
  tabs: TabSummary[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export default function WorkflowTabs({ 
  tabs, 
  activeTabId, 
  onSwitch, 
  onAdd, 
  onClose,
  onRename 
}: WorkflowTabsProps) {
  
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); 
    }
  }, [editingTabId]);

  const startEditing = (e: React.MouseEvent, tab: TabSummary) => {
    e.preventDefault(); 
    e.stopPropagation();
    setEditingTabId(tab.id);
    setTempName(tab.name);
  };

  const saveRename = () => {
    if (editingTabId) {
      onRename(editingTabId, tempName);
      setEditingTabId(null); 
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveRename();
    if (e.key === 'Escape') setEditingTabId(null);
  };
  
  return (
    <div className="viper-workflow-tabs flex h-10 w-full select-none items-center border-b border-[var(--lab-line)] bg-[var(--lab-subtle)] sm:h-9">
      
      <div className="flex-1 flex overflow-x-auto no-scrollbar h-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingTabId;
          
          return (
            <div
              key={tab.id}
              onClick={() => !isEditing && onSwitch(tab.id)} 
              onContextMenu={(e) => startEditing(e, tab)}    
              onDoubleClick={(e) => startEditing(e, tab)}    
              className={`
                group flex h-full min-w-[116px] max-w-[200px] touch-manipulation items-center border-r border-[var(--lab-line)] px-2.5 transition-all sm:min-w-[140px] sm:px-3
                ${isActive 
                  ? 'bg-[var(--lab-panel)] text-[var(--lab-blue-ink)] border-t-2 border-t-[var(--lab-blue)]' 
                  : 'text-[var(--lab-muted)] hover:bg-[var(--lab-panel)] hover:text-[var(--lab-ink)] border-t-2 border-t-transparent'}
              `}
              title={isEditing ? '' : "Right-click to rename"}
            >
              <span className={`mr-2 ${isActive ? 'opacity-100' : 'opacity-50'}`}>
                📄
              </span>

              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={saveRename} 
                  onKeyDown={handleKeyDown}
                  className="flex-1 w-full bg-[var(--lab-panel)] text-[var(--lab-ink)] text-xs px-1 py-0.5 rounded outline-none border border-[var(--lab-blue)]"
                  onClick={(e) => e.stopPropagation()} 
                />
              ) : (
                <span className="flex-1 truncate text-xs pt-0.5">
                  {tab.name}
                </span>
              )}

              {!isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); 
                    onClose(tab.id);
                  }}
                  className={`
                    ml-1 rounded-md p-1.5 hover:bg-[var(--lab-subtle)] hover:text-[var(--lab-danger)] sm:p-0.5 sm:transition-opacity
                    ${isActive ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}
                  `}
                  title="Close Tab"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onAdd}
        className="flex items-center justify-center w-10 h-full text-[var(--lab-muted)] hover:text-[var(--lab-blue-ink)] hover:bg-[var(--lab-panel)] border-l border-[var(--lab-line)] transition-colors"
        title="New Workflow"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
