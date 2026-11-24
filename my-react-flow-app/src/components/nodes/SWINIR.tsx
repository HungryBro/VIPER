// File: src/components/nodes/SwinIRNode.tsx
import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, useReactFlow, useEdges, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';
import { useNodeStatus } from '../../hooks/useNodeStatus'; 
import { ParameterLoader } from '../ParameterLoader'; 
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const DEFAULT_PARAMS = { ...NODE_DEFAULTS.swinir };
type Params = typeof DEFAULT_PARAMS;

const ALLOWED_SWINIR_KEYS = ['scale'];

const SwinIRNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const [open, setOpen] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const params = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<Params>(params);
  
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);

  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const source = loadedParams.swinir_parameters_used || loadedParams;
    const cleanParams: Partial<Params> = {};
    let count = 0;

    ALLOWED_SWINIR_KEYS.forEach((k) => {
        const val = source[k];
        if (val !== undefined && val !== null) {
            cleanParams.scale = Number(val);
            count++;
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for SwinIR.");
        return;
    }

    setForm(prev => ({ ...prev, ...cleanParams }));
  }, []);

  const onSave = useCallback(() => {
    rf.setNodes(nds => nds.map(n => 
      n.id === id 
        ? { 
            ...n, 
            data: { 
              ...n.data, 
              params: { ...form }, 
              payload: { ...(n.data?.payload || {}), params: { ...form } } 
            } 
          } 
        : n
    ));
    setOpen(false);
  }, [rf, id, form]);
  
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const visUrl = data?.payload?.vis_url || data?.payload?.output_image;
  const respJson = data?.payload?.json || data?.payload?.json_data;
  
  const originalShape = respJson?.image?.original_shape;
  const enhancedShape = respJson?.image?.enhanced_shape || data?.payload?.image_shape;

  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  
  const caption = (isSuccess && data?.description) 
    ? data.description 
    : (displayUrl ? 'Restoration complete' : 'Connect Image Input and run');

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  let borderColor = 'border-red-500';
  if (selected) borderColor = 'border-red-400 ring-2 ring-red-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected 
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' 
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-gray-500" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-red-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>SwinIR</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button
              onClick={handleOpen}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition focus-visible:outline-none cursor-pointer hover:bg-gray-100 active:scale-95"
            >
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">
              Settings
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {(originalShape && enhancedShape) ? (
           <div className="flex items-center gap-2 text-[10px] text-gray-400 font-semibold tracking-tight">
              <span>{originalShape[1]}x{originalShape[0]}</span>
              <span className="text-gray-600">➜</span>
              <span className="text-red-300">{enhancedShape[1]}x{enhancedShape[0]}</span>
           </div>
        ) : enhancedShape && (
           <div className="text-[10px] text-gray-400 font-semibold tracking-tight">
              Dimensions: {enhancedShape[1]} x {enhancedShape[0]}
           </div>
        )}
        
        {displayUrl && (
          <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
        )}
        
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span>
           <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="SwinIR Settings" onClose={handleClose}>
        <div className="grid grid-cols-1 gap-4 text-xs text-gray-300">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="uppercase font-bold text-gray-400 text-[10px] tracking-wider">Scale Factor</label>
              <input 
                type="number" min="1" max="4" step="1"
                className="nodrag w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-red-400 font-mono text-right outline-none focus:border-red-500"
                value={form.scale}
                onChange={(e) => setForm((s: Params) => ({ ...s, scale: Number(e.target.value) }))}
              />
            </div>
            <input 
              type="range" step="1" min="1" max="4" 
              className="nodrag nopan w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500" 
              value={form.scale} 
              onChange={(e) => setForm((s: Params) => ({ ...s, scale: Number(e.target.value) }))} 
            />
          </div>
          
          <div className="pt-2 border-t border-gray-700">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="SwinIR" />
          </div>

        </div>
        <div className="flex justify-end gap-2 pt-5 border-t border-gray-700 mt-4">
          <button onClick={handleClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-red-600 text-white text-xs font-bold cursor-pointer hover:bg-red-500 transition">Save</button>
        </div>
      </Modal>
    </div>
  )
})

export default SwinIRNode;