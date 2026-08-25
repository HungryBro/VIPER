// File: src/components/nodes/RealESRGANNode.tsx
import { memo, useEffect, useMemo, useState, useCallback } from "react"
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from "reactflow"
import Modal from "../common/Modal"
import { abs } from "../../lib/api"
import type { CustomNodeData } from "../../types"
import { useNodeStatus } from '../../hooks/useNodeStatus';
import { ParameterLoader } from '../ParameterLoader'; 

const SettingsSlidersIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="black" aria-hidden="true">
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4}>
      <path d="M3 7h18" /><circle cx="9" cy="7" r="3.4" fill="white" />
      <path d="M3 17h18" /><circle cx="15" cy="17" r="3.4" fill="white" />
    </g>
  </svg>
);

const FIXED_MODEL = "RealESRGAN_x4plus.pth";

const DEFAULT_PARAMS = {
  scale: 4,
  denoise: 0.4,
  model: FIXED_MODEL
};
type Params = typeof DEFAULT_PARAMS;

const ALLOWED_REALESRGAN_KEYS = ['scale', 'denoise', 'denoise_strength'];

const RealESRGANNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const [open, setOpen] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const params = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<Params>(params);
  
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);

  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const source = loadedParams.parameters_used || loadedParams;
    const cleanParams: Partial<Params> = {};
    let count = 0;

    ALLOWED_REALESRGAN_KEYS.forEach((k) => {
        const val = source[k];
        if (val !== undefined && val !== null) {
            if (k === 'denoise_strength' || k === 'denoise') {
                cleanParams.denoise = Number(val);
                count++;
            } else if (k === 'scale') {
                cleanParams.scale = Number(val);
                count++;
            }
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for Real-ESRGAN.");
        return;
    }

    setForm(prev => ({ ...prev, ...cleanParams }));
  }, []);

  const onSave = useCallback(() => {
    const finalParams = { 
      ...form, 
      model: FIXED_MODEL,
      scale: Math.max(1, Number(form.scale)), 
      denoise: Math.min(1, Math.max(0, Number(form.denoise))) 
    };
    
    rf.setNodes(nds => nds.map(n => 
      n.id === id 
        ? { 
            ...n, 
            data: { 
              ...n.data, 
              params: finalParams, 
              payload: { ...(n.data?.payload || {}), params: finalParams } 
            } 
          } 
        : n
    ));
    setOpen(false);
  }, [rf, id, form]);

  const visUrl = data?.payload?.vis_url || data?.payload?.output_image;
  const sourceData = useMemo(
    () => data?.payload?.json_data || data?.payload?.json || {},
    [data?.payload?.json_data, data?.payload?.json],
  );

  const getSizeText = useMemo(() => {
    let w_in, h_in, w_out, h_out;

    if (sourceData.input_resolution) [w_in, h_in] = sourceData.input_resolution;
    if (sourceData.output_resolution) [w_out, h_out] = sourceData.output_resolution;
    
    if (!w_in && sourceData.image?.original_shape) [h_in, w_in] = sourceData.image.original_shape;
    if (!w_out && sourceData.image?.enhanced_shape) [h_out, w_out] = sourceData.image.enhanced_shape;

    if (w_in && h_in && w_out && h_out) {
        return (
            <div className="flex items-center justify-between w-full text-[10px] bg-slate-900/40 p-1.5 rounded border border-gray-700/50">
                <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 uppercase font-bold">Input</span>
                    <span className="text-gray-300 font-mono">{w_in}x{h_in}</span>
                </div>
                
                <span className="text-gray-500 mx-1">➜</span>
                
                <div className="flex flex-col text-right">
                    <span className="text-[9px] text-red-400 uppercase font-bold">Output</span>
                    <span className="text-red-300 font-mono font-bold">{w_out}x{h_out}</span>
                </div>
            </div>
        );
    }
    
    if (w_out && h_out) {
        return <span className="text-[10px] text-gray-400">Output: {w_out} x {h_out}</span>;
    }

    return null;
  }, [sourceData]);

  const psnr = sourceData?.psnr;
  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  
  const caption = (isSuccess && data?.description) 
    ? data.description 
    : (displayUrl ? 'Result preview' : 'Connect Image Input and run');

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
        <div>Real-ESRGAN</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => !isRunning && data?.onRunNode?.(id)}
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
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition focus-visible:outline-none cursor-pointer hover:bg-gray-100"
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
        {getSizeText}
        
        {displayUrl && (
          <div className="space-y-2">
            <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
            {psnr && <div className="text-[10px] text-green-400 text-center font-bold">PSNR: {psnr} dB</div>}
          </div>
        )}
        
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span>
           <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="Real-ESRGAN Settings" onClose={handleClose}>
        <div className="grid grid-cols-1 gap-3 text-xs text-gray-300">
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Model Weights</label>
            <div className="w-full bg-gray-900 rounded border border-gray-700 p-2 text-red-400 font-mono opacity-80 select-none">
              {FIXED_MODEL}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Scale (min 1)</label>
              <input 
                type="number" step="0.5" min="1"
                className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-red-400 font-mono outline-none focus:border-red-500" 
                value={form.scale} 
                onChange={e => setForm((s: Params) => ({ ...s, scale: Number(e.target.value) }))} 
                onBlur={(e) => setForm(s => ({ ...s, scale: Math.max(1, Number(e.target.value)) }))}
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Denoise (0-1)</label>
              <input 
                type="number" step="0.1" min="0" max="1"
                className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-red-400 font-mono outline-none focus:border-red-500" 
                value={form.denoise} 
                onChange={e => setForm((s: Params) => ({ ...s, denoise: Number(e.target.value) }))}
                onBlur={(e) => {
                    let v = Number(e.target.value);
                    if (v < 0) v = 0;
                    if (v > 1) v = 1;
                    setForm(s => ({ ...s, denoise: v }));
                }}
              />
            </div>
          </div>
          
          <div className="pt-2 border-t border-gray-700">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="Real-ESRGAN" />
          </div>

        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
          <button onClick={handleClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-red-600 text-white text-xs font-bold cursor-pointer hover:bg-red-500 transition">Save</button>
        </div>
      </Modal>
    </div>
  )
})

export default RealESRGANNode;
