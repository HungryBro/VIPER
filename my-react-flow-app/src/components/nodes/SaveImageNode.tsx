// src/components/nodes/SaveImageNode.tsx
import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps, useEdges } from 'reactflow'; 
import type { CustomNodeData } from '../../types';

const SaveImageNode = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const edges = useEdges(); 
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success';
  const isFault = data.status === 'fault';

  let borderColor = 'border-gray-500';
  if (selected) {
    borderColor = 'border-gray-400 ring-2 ring-gray-500'; 
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50'; 
  }

  const handleRun = useCallback(() => {
    if (data.onRunNode) data.onRunNode(id);
    else console.warn("onRunNode function not found");
  }, [data, id]);

  const handleClasses = `w-3 h-3 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 text-white rounded-lg p-3 w-48 text-center border-2 shadow-md transition-all duration-200 ${borderColor}`}>
      <div className="font-bold text-gray-400 mb-1">Save Image</div>
      <p className="text-xs text-gray-400 mb-2">Export processed output</p>
      
      <button 
        onClick={handleRun} 
        disabled={isRunning} 
        className={`nodrag w-full px-3 py-1.5 rounded text-sm font-medium transition-colors duration-200 text-white 
          ${isSuccess ? "bg-green-600 hover:bg-green-700" : isFault ? "bg-red-600 hover:bg-red-700" : "bg-gray-600 hover:bg-gray-500"} 
          ${isRunning ? "opacity-70 cursor-wait" : "cursor-pointer"}`}
      >
        {isRunning ? "Saving..." : isSuccess ? "✅ Saved!" : isFault ? "❌ Failed" : "Save Image"}
      </button>

      {data.output?.saved_path && (
        <div className="mt-2 p-1 bg-gray-900 rounded text-[10px] text-gray-300 break-all border border-gray-700">
          Path: {data.output.saved_path.split(/[/\\]/).pop()}
        </div>
      )}

      <Handle type="target" position={Position.Left} className={handleClasses} />
    </div>
  );
}

export default memo(SaveImageNode);