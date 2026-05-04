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
    <div className="flex items-center bg-gray-900 border-b border-gray-700 w-full h-9 select-none">
      
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
                group flex items-center min-w-[140px] max-w-[200px] px-3 border-r border-gray-700 cursor-pointer transition-all h-full
                ${isActive 
                  ? 'bg-gray-800 text-teal-400 border-t-2 border-t-teal-500' 
                  : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200 border-t-2 border-t-transparent'}
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
                  className="flex-1 w-full bg-gray-700 text-white text-xs px-1 py-0.5 rounded outline-none border border-teal-500"
                  onClick={(e) => e.stopPropagation()} 
                />
              ) : (
                <span className="flex-1 truncate text-xs font-medium font-mono pt-0.5">
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
                    ml-1 p-0.5 rounded-md hover:bg-gray-700 hover:text-red-400 transition-opacity
                    ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
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
        className="flex items-center justify-center w-10 h-full text-gray-500 hover:text-teal-400 hover:bg-gray-800 border-l border-gray-700 transition-colors"
        title="New Workflow"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}


