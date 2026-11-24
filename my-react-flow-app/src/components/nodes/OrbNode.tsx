// File: src/components/nodes/OrbNode.tsx
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api'; 
import { useNodeStatus } from '../../hooks/useNodeStatus';
import { ParameterLoader } from '../ParameterLoader'; 
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const DEFAULT_ORB = { ...NODE_DEFAULTS.orb };

type Params = typeof DEFAULT_ORB;

const ALLOWED_ORB_KEYS = [
  'nfeatures', 
  'scaleFactor', 
  'nlevels', 
  'edgeThreshold', 
  'firstLevel', 
  'WTA_K', 
  'scoreType', 
  'patchSize', 
  'fastThreshold'
];

const OrbNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const params = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_ORB, ...p };
  }, [data?.params, data?.payload?.params]);
  
  const [form, setForm] = useState<Params>(params);
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const displaySize = useMemo(() => {
    const imgData = data?.payload?.json_data?.image;
    const shape = imgData?.processed_orb_shape || 
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
    
    ALLOWED_ORB_KEYS.forEach((k) => {
        const key = k as keyof Params;
        const rawValue = loadedParams[key];

        if (rawValue !== undefined && rawValue !== null) {
            
            if (key === 'scoreType') {
                const val = String(rawValue);
                if (val === 'FAST' || val === 'HARRIS') {
                    cleanParams.scoreType = val as 'FAST' | 'HARRIS';
                    count++;
                }
            } 
            else {
                (cleanParams as any)[key] = Number(rawValue);
                count++;
            }
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for ORB in this file.");
        return;
    }

    setForm((prev) => ({ ...prev, ...cleanParams }));
  }, []);

  const saveParams = useCallback(() => {
    const validParams = {
        ...form,
        nfeatures: Math.max(0, Number(form.nfeatures)),
        scaleFactor: Math.max(1.01, Number(form.scaleFactor)),
        nlevels: Math.max(1, Number(form.nlevels)),
        edgeThreshold: Math.max(1, Number(form.edgeThreshold)),
        patchSize: Math.max(2, Number(form.patchSize))
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

  const resultUrl = data?.payload?.result_image_url || data?.payload?.vis_url;
  const displayUrl = resultUrl ? `${abs(resultUrl)}?t=${Date.now()}` : undefined;
  
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
        <div>ORB</div>
        <div className="flex items-center gap-2">
          <button onClick={() => !isRunning && data?.onRunNode?.(id)} disabled={isRunning} className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white ${isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-green-600 hover:bg-green-700'}`}>
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
        </div>
      </div>

      <div className="p-4 space-y-3">
        {displaySize && <div className="text-[10px] text-gray-400 font-semibold tracking-tight">Dimensions: {displaySize}</div>}
        {displayUrl && <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />}
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      <Modal inline onCommit={saveParams} open={open} title="ORB Settings" onClose={() => setOpen(false)}>
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-300 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="col-span-2 border-b border-gray-700 pb-2 mb-2">
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">nFeatures</label>
            <input 
              type="number" min="0" step="10"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.nfeatures} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nfeatures: Number(e.target.value) }))} 
            />
            {form.nfeatures === 0 && <div className="text-[9px] text-amber-400 mt-1 italic">⚠ 0 = Unlimited</div>}
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Scale Factor</label>
            <input 
              type="number" step="0.1" min="1.01"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.scaleFactor} 
              onChange={(e) => setForm((s: Params) => ({ ...s, scaleFactor: Number(e.target.value) }))}
              onBlur={(e) => { if(Number(e.target.value) <= 1) setForm(s=>({...s, scaleFactor: 1.1})) }}
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Levels</label>
            <input 
              type="number" min="1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.nlevels} 
              onChange={(e) => setForm((s: Params) => ({ ...s, nlevels: Number(e.target.value) }))}
              onBlur={(e) => { if(Number(e.target.value) < 1) setForm(s=>({...s, nlevels: 1})) }}
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Edge Thresh</label>
            <input 
              type="number" min="1"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.edgeThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, edgeThreshold: Number(e.target.value) }))} 
              onBlur={(e) => { if(Number(e.target.value) < 1) setForm(s=>({...s, edgeThreshold: 1})) }}
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Patch Size</label>
            <input 
              type="number" min="2"
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.patchSize} 
              onChange={(e) => setForm((s: Params) => ({ ...s, patchSize: Number(e.target.value) }))} 
              onBlur={(e) => { if(Number(e.target.value) < 2) setForm(s=>({...s, patchSize: 2})) }}
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">WTA_K</label>
            <select 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.WTA_K} 
              onChange={(e) => setForm((s: Params) => ({ ...s, WTA_K: Number(e.target.value) }))}
            >
              <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Score Type</label>
            <select 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.scoreType} 
              onChange={(e) => setForm((s: Params) => ({ ...s, scoreType: e.target.value as 'FAST' | 'HARRIS' }))}
            >
              <option value="FAST">FAST</option><option value="HARRIS">HARRIS</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Fast Thresh</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.fastThreshold} 
              onChange={(e) => setForm((s: Params) => ({ ...s, fastThreshold: Number(e.target.value) }))} 
            />
          </div>
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">First Level</label>
            <input 
              type="number" 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-green-500" 
              value={form.firstLevel} 
              onChange={(e) => setForm((s: Params) => ({ ...s, firstLevel: Number(e.target.value) }))} 
            />
          </div>
          
          <div className="col-span-2 pt-2">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="ORB" />
          </div>

        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-6">
          <button onClick={() => setOpen(false)} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
          <button onClick={saveParams} className="px-4 py-1.5 rounded bg-green-600 text-white font-bold transition hover:bg-green-500 text-xs">Save</button>
        </div>
      </Modal>

    </div>
  );
});

export default OrbNode;