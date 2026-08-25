// File: src/components/nodes/AffineAlignNode.tsx
import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useStore } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';
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

type Params = {
  model: 'affine' | 'partial';
  warp_mode: 'image2_to_image1' | 'image1_to_image2';
  blend: boolean;
  ransac_thresh: number;
  confidence: number;
  refine_iters: number;
};

const DEFAULT_PARAMS: Params = {
  model: 'affine',
  warp_mode: 'image2_to_image1',
  blend: false,
  ransac_thresh: 3.0,
  confidence: 0.99,
  refine_iters: 10,
};

const ALLOWED_AFFINE_KEYS = [
  'model', 
  'warp_mode', 
  'blend', 
  'ransac_thresh', 
  'confidence', 
  'refine_iters'
];

const AffineAlignNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const isConnected = useStore(
    useCallback((s: any) => s.edges.some((e: any) => e.target === id), [id])
  );

  const savedParams = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<Params>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const onClose = () => { setForm(savedParams); setOpen(false); };

  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const cleanParams: Partial<Params> = {};
    let count = 0;

    ALLOWED_AFFINE_KEYS.forEach((k) => {
        const key = k as keyof Params;
        const val = loadedParams[key];

        if (val !== undefined && val !== null) {
            if (key === 'model') {
                if (['affine', 'partial'].includes(val)) {
                    cleanParams.model = val;
                    count++;
                }
            } else if (key === 'warp_mode') {
                if (['image2_to_image1', 'image1_to_image2'].includes(val)) {
                    cleanParams.warp_mode = val;
                    count++;
                }
            } else if (key === 'blend') {
                cleanParams.blend = Boolean(val);
                count++;
            } else {
                (cleanParams as any)[key] = Number(val);
                count++;
            }
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for Affine Alignment.");
        return;
    }

    setForm(prev => ({ ...prev, ...cleanParams }));
  }, []);

  const onSave = useCallback(() => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                params: { ...form }, 
                payload: { ...(n.data?.payload || {}), params: { ...form } },
              },
            }
          : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const onRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const resp = data?.payload?.json as any | undefined;
  const payloadUrl = data?.payload?.aligned_url || data?.payload?.result_image_url;
  const jsonPath = resp?.output?.aligned_url || resp?.output?.aligned_image;
  const rawUrl = payloadUrl || jsonPath;
  const alignedUrl = rawUrl 
    ? `${abs(rawUrl)}?t=${Date.now()}` 
    : undefined;

  const displaySize = useMemo(() => {
    const jsonData = data?.payload?.json_data || data?.payload?.output || data?.payload?.json;
    
    let shape = jsonData?.output?.aligned_shape;
    if (!shape) shape = jsonData?.output?.shape;
    if (!shape) shape = data?.payload?.aligned_shape;

    if (Array.isArray(shape) && shape.length >= 2) {
      return `${shape[1]}×${shape[0]}px`;
    }
    return null;
  }, [data?.payload]);

  // Style
  let borderColor = 'border-purple-500';
  if (selected) borderColor = 'border-purple-400 ring-2 ring-purple-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;
  
  const sourceHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 max-w-sm text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={sourceHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-purple-500 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>Affine Align</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          <span className="relative inline-flex items-center group">
            <button
              aria-label="Open Affine settings"
              onClick={() => setOpen(true)}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80 transition focus:outline-none"
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
        {displaySize && (
          <div className="text-[10px] text-gray-400 mb-2">
            Output: {displaySize}
          </div>
        )}

        {alignedUrl && (
          <a href={alignedUrl} target="_blank" rel="noreferrer">
            <img
              src={alignedUrl}
              alt="affine-aligned"
              className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56 bg-black/20"
              draggable={false}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </a>
        )}

        <p className="text-sm text-gray-300">
          {(isSuccess || alignedUrl) ? 'Alignment complete' : 'Connect a Matcher node and run'}
        </p>
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className={statusDot(data?.status === 'start', 'bg-red-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          <div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} />
        </div>
      </div>

      <Modal open={open} title="Affine Settings" onClose={onClose}>
        <div className="space-y-3 text-xs text-gray-300">
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Model</label>
            <select
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-purple-400 font-mono outline-none focus:border-purple-500"
              value={form.model}
              onChange={(e) => setForm((s) => ({ ...s, model: e.target.value as Params['model'] }))}
            >
              <option value="affine">Affine</option>
              <option value="partial">Partial</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Warp Mode</label>
            <select
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-purple-400 font-mono outline-none focus:border-purple-500"
              value={form.warp_mode}
              onChange={(e) => setForm((s) => ({ ...s, warp_mode: e.target.value as Params['warp_mode'] }))}
            >
              <option value="image2_to_image1">Img2 → Img1</option>
              <option value="image1_to_image2">Img1 → Img2</option>
            </select>
          </div>

          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={form.blend}
              onChange={(e) => setForm((s) => ({ ...s, blend: e.target.checked }))}
              className="accent-purple-500"
            />
            Blend overlay
          </label>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">RANSAC Thresh</label>
            <input
              type="number" step="0.1" min={0.1}
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-purple-400 font-mono outline-none focus:border-purple-500"
              value={form.ransac_thresh}
              onChange={(e) => setForm((s) => ({ ...s, ransac_thresh: Number(e.target.value) }))}
              onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val < 0.1) setForm(s => ({ ...s, ransac_thresh: 0.1 }));
              }}
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Confidence (0.1 - 1.0)</label>
            <input
              type="number" step="0.01" min={0} max={1}
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-purple-400 font-mono outline-none focus:border-purple-500"
              value={form.confidence}
              onChange={(e) => setForm((s) => ({ ...s, confidence: Number(e.target.value) }))}
              onBlur={(e) => {
                  let val = Number(e.target.value);
                  if (val < 0.01) val = 0.01;
                  if (val > 1.0) val = 1.0;
                  setForm(s => ({ ...s, confidence: val }));
              }}
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Refine Iters</label>
            <input
              type="number" min={0}
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-purple-400 font-mono outline-none focus:border-purple-500"
              value={form.refine_iters}
              onChange={(e) => setForm((s) => ({ ...s, refine_iters: Number(e.target.value) }))}
              onBlur={(e) => {
                  if (Number(e.target.value) < 0) setForm(s => ({ ...s, refine_iters: 0 }));
              }}
            />
          </div>
          
          <div className="pt-2">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="AffineAlignment" />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
            <button onClick={onClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
            <button onClick={onSave} className="px-4 py-1.5 rounded bg-purple-600 text-white text-xs font-bold cursor-pointer hover:bg-purple-700 transition">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default AffineAlignNode;
