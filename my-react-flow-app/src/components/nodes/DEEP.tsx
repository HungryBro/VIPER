// File: src/components/nodes/DEEP.tsx
import { memo, useState, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import Modal from "../common/Modal";
import { abs } from "../../lib/api";
import type { CustomNodeData } from "../../types";
import { useNodeStatus } from '../../hooks/useNodeStatus';

const VOC_CLASSES = [
  "background", "aeroplane", "bicycle", "bird", "boat", "bottle", "bus", "car", "cat",
  "chair", "cow", "diningtable", "dog", "horse", "motorbike", "person", "pottedplant",
  "sheep", "sofa", "train", "tvmonitor"
];

const InfoIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const DeepLabNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const edges = useEdges();
  const [open, setOpen] = useState(false);
  
  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const visUrl = data?.payload?.vis_url || data?.payload?.segmented_image;
  const json_data = data?.payload?.json_data || data?.payload?.json || data?.payload; 

  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  
  const caption = (isSuccess && data?.description) 
    ? data.description 
    : (displayUrl ? 'Segmentation complete' : 'Detects all supported objects');

  const displaySize = useMemo(() => {
    const imgMeta = json_data?.image || {};
    const shape = imgMeta.segmented_shape || imgMeta.mask_shape || imgMeta.original_shape || data?.payload?.output_shape;

    if (Array.isArray(shape) && shape.length >= 2) {
      const h = shape[0];
      const w = shape[1];
      return `${w} x ${h}`; 
    }
    return null;
  }, [json_data, data?.payload]);

  let borderColor = 'border-yellow-600';
  if (selected) borderColor = 'border-yellow-400 ring-2 ring-yellow-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected 
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' 
      : 'bg-white border-yellow-600'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-yellow-600" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-yellow-500 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>DeepLabv3+</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
                isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-yellow-600 hover:bg-yellow-500'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button
              onClick={() => setOpen(true)}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition focus-visible:outline-none cursor-pointer hover:bg-gray-100 active:scale-95"
            >
              <InfoIcon className="h-3.5 w-3.5 text-gray-600" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">
              Info
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {displaySize && (
          <div className="text-[10px] text-gray-400 font-semibold tracking-tight">
            Dimensions: {displaySize}
          </div>
        )}

        {displayUrl && (
          <div className="relative group">
            <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
          </div>
        )}

        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

       <Modal open={open} title="Supported Classes (Pascal VOC)" onClose={() => setOpen(false)}>
        <div className="space-y-4 text-xs text-gray-300">
            <p className="text-gray-400 italic">
              This model automatically segments all objects belonging to these categories:
            </p>
            
            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600">
                {VOC_CLASSES.map((label, index) => (
                    label !== 'background' && (
                      <div key={index} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center text-yellow-500/90 font-mono text-[10px]">
                          {label}
                      </div>
                    )
                ))}
            </div>
            
            <div className="flex justify-end pt-4 border-t border-gray-700 mt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white font-bold">
                Close
              </button>
            </div>
        </div>
      </Modal>
    </div>
  );
});

export default DeepLabNode;