import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api'; 
import { useNodeStatus } from '../../hooks/useNodeStatus';
import { ParameterLoader } from '../ParameterLoader'; 
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const DEFAULT_SURF = { ...NODE_DEFAULTS.surf };

type Params = typeof DEFAULT_SURF;

const ALLOWED_SURF_KEYS = [
  'hessianThreshold', 
  'nOctaves', 
  'nOctaveLayers', 
  'extended', 
  'upright'
];

const SurfNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const params = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_SURF, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<Params>(params);
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const displaySize = useMemo(() => {
    const imgData = data?.payload?.json_data?.image;
    const shape = imgData?.processed_surf_shape || 
                  imgData?.processed_shape || 
                  imgData?.original_shape || 
                  data?.payload?.image_shape;
    
    if (Array.isArray(shape) && shape.length >= 2) {
      return `${shape[1]} x ${shape[0]}`;
    }
    return null;
  }, [data?.payload]);

  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const cleanParams: Partial<Params> = {};
    let count = 0;
    
    ALLOWED_SURF_KEYS.forEach((key) => {
        if (loadedParams[key] !== undefined && loadedParams[key] !== null) {
            if (key === 'extended' || key === 'upright') {
                cleanParams[key as keyof Params] = Boolean(loadedParams[key]) as any;
            } else {
                cleanParams[key as keyof Params] = Number(loadedParams[key]) as any;
            }
            count++;
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for SURF in this file.");
        return;
    }

    setForm((prev) => ({ ...prev, ...cleanParams }));
  }, []);

  const saveParams = useCallback(() => {
    const validParams = {
        hessianThreshold: Math.max(1, Number(form.hessianThreshold)),
        nOctaves: Math.max(1, Number(form.nOctaves)),
        nOctaveLayers: Math.max(1, Number(form.nOctaveLayers)),
        extended: form.extended,
        upright: form.upright
    };

    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { 
          ...n, 
          data: { 
            ...n.data, 
            params: validParams, 
            payload: { ...(n.data?.payload || {}), params: validParams } 
          } 
        } : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const displayUrl = data?.payload?.vis_url ? `${abs(data.payload.vis_url)}?t=${Date.now()}` : undefined;
  
  const caption = (isSuccess && data?.description) 
    ? data.description
    : (displayUrl ? 'Result preview' : 'Connect Image Input and run');

  let borderStyle = 'border-green-500';
  if (selected) borderStyle = 'border-green-400 ring-2 ring-green-500';
  else if (isRunning) borderStyle = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected 
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' 
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderStyle}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-gray-500" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-green-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>SURF</div>
        <div className="flex items-center gap-2">
          <button onClick={() => !isRunning && data?.onRunNode?.(id)} disabled={isRunning} className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white ${isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700'}`}>
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          <span className="relative inline-flex items-center group">
            <button onClick={() => setOpen(true)} className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition hover:bg-gray-100 focus:outline-none">
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">Settings<span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" /></span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {displaySize && <div className="text-[10px] text-gray-400 font-semibold tracking-tight">Dimensions: {displaySize}</div>}
        {displayUrl && <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />}
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="SURF Settings" onClose={() => setOpen(false)}>
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-300">
          <div className="col-span-2">
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Hessian Threshold</label>
            <input 
              type="number" min="1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.hessianThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, hessianThreshold: Number(e.target.value) }))}
              onBlur={(e) => { if(Number(e.target.value) < 1) setForm(s=>({...s, hessianThreshold: 1})) }}
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Octaves</label>
            <input 
              type="number" min="1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nOctaves} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nOctaveLayers: Number(e.target.value) }))} 
              onBlur={(e) => { if(Number(e.target.value) < 1) setForm(s=>({...s, nOctaves: 1})) }}
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Layers</label>
            <input 
              type="number" min="1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nOctaveLayers} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nOctaveLayers: Number(e.target.value) }))} 
              onBlur={(e) => { if(Number(e.target.value) < 1) setForm(s=>({...s, nOctaveLayers: 1})) }}
            />
          </div>
          <div className="col-span-2 space-y-2 pt-2 text-[10px] font-bold text-gray-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.extended} onChange={(e) => setForm((s: Params) => ({ ...s, extended: e.target.checked }))} className="accent-green-500" /> 
              Extended (128-d)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.upright} onChange={(e) => setForm((s: Params) => ({ ...s, upright: e.target.checked }))} className="accent-green-500" /> 
              Upright (No rotation)
            </label>
          </div>
          
          <div className="col-span-2 pt-2">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="SURF" />
          </div>

        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
          <button onClick={() => setOpen(false)} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
          <button onClick={saveParams} className="px-4 py-1.5 rounded bg-green-600 text-white text-xs font-bold cursor-pointer hover:bg-green-500 transition">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default SurfNode;