// src/components/nodes/SaveJsonNode.tsx
import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps, useEdges } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import { useNodeStatus } from '../../hooks/useNodeStatus';

const SaveJsonNode = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const edges = useEdges(); 

  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success';
  const isFault = data.status === 'fault';
  const { statusDot } = useNodeStatus(data);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

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
      <div className="font-bold text-gray-400 mb-1">Save JSON</div>
      <p className="text-xs text-gray-400 mb-2">Export descriptors</p>
      
      <button 
        onClick={handleRun} 
        disabled={isRunning} 
        className={`nodrag w-full px-3 py-1.5 rounded text-sm font-medium transition-colors duration-200 text-white 
          ${
            isSuccess 
              ? "bg-green-600 hover:bg-green-700" 
              : isFault 
              ? "bg-red-600 hover:bg-red-700" 
              : "bg-gray-600 hover:bg-gray-500"
          } 
          ${isRunning ? "opacity-70 cursor-wait" : "cursor-pointer"}`
        }
      >
        {isRunning ? "Saving..." : isSuccess ? "✅ Saved!" : isFault ? "❌ Failed" : "Save JSON"}
      </button>

      {data.output?.saved_path && (
        <div className="mt-2 p-1 bg-gray-900 rounded text-[10px] text-gray-300 break-all border border-gray-700">
          File: {data.output.saved_path.split(/[/\\]/).pop()}
        </div>
      )}

      {/* แถวสถานะกินพื้นที่ padding ของโหนด ให้เส้นคั่นกว้างเต็มโหนดเหมือนโหนดอื่น โหนดนี้แคบ (w-48) จึงให้คอลัมน์กว้างตามข้อความ ไม่แบ่งเท่ากัน */}
      <div className="-mx-3 -mb-3 mt-3">
        <div className="grid grid-cols-[repeat(4,auto)] justify-between border-t-2 border-gray-700 px-2 pb-2 pt-1.5 text-xs font-medium">
          <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data.status === 'start', 'bg-red-500')} /></div>
          <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(isRunning, 'bg-cyan-400 animate-pulse')} /></div>
          <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
          <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className={handleClasses} />
    </div>
  );
}

export default memo(SaveJsonNode);