import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api'; 
import { useNodeStatus } from '../../hooks/useNodeStatus';
import { ParameterLoader } from '../ParameterLoader'; 
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const DEFAULT_SIFT = { ...NODE_DEFAULTS.sift };
type Params = typeof DEFAULT_SIFT;

const ALLOWED_SIFT_KEYS = [
  'nfeatures', 
  'nOctaveLayers', 
  'contrastThreshold', 
  'edgeThreshold', 
  'sigma'
];

const SiftNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const params = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_SIFT, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<Params>(params);
  
  useEffect(() => { 
    if (!open) setForm(params); 
  }, [params, open]);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);

  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const cleanParams: Partial<Params> = {};
    let count = 0;
    
    ALLOWED_SIFT_KEYS.forEach((key) => {
        if (loadedParams[key] !== undefined && loadedParams[key] !== null) {
            cleanParams[key as keyof Params] = Number(loadedParams[key]); 
            count++;
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for SIFT in this file.");
        return;
    }

    setForm((prev) => ({
      ...prev,
      ...cleanParams 
    }));
  }, []);

  const onSave = useCallback(() => {
    const validParams = {
        nfeatures: Math.max(0, Number(form.nfeatures)), 
        nOctaveLayers: Math.max(1, Number(form.nOctaveLayers)),
        contrastThreshold: Math.max(0.01, Number(form.contrastThreshold)),
        edgeThreshold: Math.max(1, Number(form.edgeThreshold)),
        sigma: Math.max(0.1, Number(form.sigma))
    };

    rf.setNodes((nds) => nds.map((n) =>
      n.id === id
        ? { 
            ...n, 
            data: { 
              ...n.data, 
              params: validParams,
              payload: { ...(n.data?.payload || {}), params: validParams } 
            } 
          }
        : n
    ));
    setOpen(false);
  }, [rf, id, form]);
  
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const displaySize = useMemo(() => {
    const processedShape = data?.payload?.json_data?.image?.processed_sift_shape || 
                           data?.payload?.image_shape || 
                           data?.payload?.output?.image_shape;

    if (Array.isArray(processedShape) && processedShape.length >= 2) {
      return `${processedShape[1]} x ${processedShape[0]}`; 
    }
    return null;
  }, [data?.payload]);

  const rawUrl = data?.payload?.vis_url || data?.payload?.result_image_url;
  const displayUrl = rawUrl ? `${abs(rawUrl)}?t=${Date.now()}` : undefined;
  
  const caption = (isSuccess && data?.description) 
    ? data.description 
    : (displayUrl ? 'Result preview' : 'Connect Image Input and run');

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  let borderColor = 'border-green-500';
  if (selected) borderColor = 'border-green-400 ring-2 ring-green-500';
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

      <div className="bg-gray-700 text-green-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>SIFT</div>
        <div className="flex items-center gap-2">
          <button onClick={handleRun} disabled={isRunning} className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700'}`}>
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button onClick={handleOpen} className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition focus-visible:outline-none cursor-pointer hover:bg-gray-100 active:scale-95">
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

      <Modal open={open} title="SIFT Settings" onClose={handleClose}>
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-300">
          
          <div className="col-span-2">
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">nFeatures</label>
            <input 
              type="number" min="0" step="10"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nfeatures} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nfeatures: Number(e.target.value) }))} 
            />
            {form.nfeatures === 0 && <div className="text-[9px] text-amber-400 mt-1 italic">⚠ 0 = Unlimited</div>}
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Octave Layers</label>
            <input 
              type="number" min="1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.nOctaveLayers} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nOctaveLayers: Number(e.target.value) }))}
              onBlur={(e) => { if (Number(e.target.value) < 1) setForm(s => ({ ...s, nOctaveLayers: 1 })); }}
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Sigma</label>
            <input 
              type="number" step="0.1" min="0.1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.sigma} 
              onChange={(e) => setForm((s: Params) => ({ ...s, sigma: Number(e.target.value) }))} 
              onBlur={(e) => { if (Number(e.target.value) < 0.1) setForm(s => ({ ...s, sigma: 0.1 })); }}
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Contrast Th.</label>
            <input 
              type="number" step="0.01" min="0.01"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.contrastThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, contrastThreshold: Number(e.target.value) }))} 
              onBlur={(e) => { if (Number(e.target.value) < 0.01) setForm(s => ({ ...s, contrastThreshold: 0.01 })); }}
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Edge Th.</label>
            <input 
              type="number" min="1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-green-400 font-mono outline-none focus:border-green-500" 
              value={form.edgeThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, edgeThreshold: Number(e.target.value) }))} 
              onBlur={(e) => { if (Number(e.target.value) < 1) setForm(s => ({ ...s, edgeThreshold: 1 })); }}
            />
          </div>

          <div className="col-span-2">
            <ParameterLoader 
                onLoad={handleParamsLoaded} 
                checkTool="SIFT" 
            />
          </div>

        </div>

        <div className="flex justify-end gap-2 pt-5 border-t border-gray-700 mt-4">
          <button onClick={handleClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-green-600 text-white text-xs font-bold cursor-pointer hover:bg-green-500 transition">Save</button>
        </div>
      </Modal>

    </div>
  );
});

export default SiftNode;