// File: src/components/nodes/DnCNNNode.tsx
import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow';
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';
import { useNodeStatus } from '../../hooks/useNodeStatus'; 
import { ParameterLoader } from '../ParameterLoader';
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const DEFAULT_PARAMS = { ...NODE_DEFAULTS.dncnn };
type Params = typeof DEFAULT_PARAMS;

const ALLOWED_DNCNN_KEYS = ['sigma'];

const DnCNNNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
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
    const source = loadedParams.dncnn_parameters_used || loadedParams;
    const cleanParams: Partial<Params> = {};
    let count = 0;

    ALLOWED_DNCNN_KEYS.forEach((k) => {
        const val = source[k];
        if (val !== undefined && val !== null) {
            cleanParams.sigma = Number(val);
            count++;
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for DnCNN.");
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

  const enhancedShape = respJson?.image?.enhanced_shape || data?.payload?.image_shape;
  const usedParams = respJson?.dncnn_parameters_used || {};

  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  
  const caption = (isSuccess && data?.description) 
    ? data.description 
    : (displayUrl ? 'Restoration complete' : 'Connect Noisy Image and run');

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
        <div>DnCNN</div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRun} 
            disabled={isRunning}
            className={['px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white', isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-red-600 hover:bg-red-700'].join(' ')}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button onClick={handleOpen} className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 hover:bg-gray-100">
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
        {enhancedShape && (
          <div className="text-[10px] text-gray-400 font-semibold tracking-tight">
             Dimensions: {enhancedShape[1]} x {enhancedShape[0]}
          </div>
        )}

        {displayUrl && (
          <div className="relative group">
             <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
             
             {usedParams.model_loaded && (
                <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur-sm border border-white/10">
                   {usedParams.model_loaded}
                </div>
             )}
          </div>
        )}
        
        <p className="text-sm text-gray-300 break-words leading-relaxed">
          {caption}
        </p>
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span>
           <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="DnCNN Settings" onClose={handleClose}>
        <div className="space-y-4 text-xs text-gray-300 min-w-[250px]">
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="uppercase font-bold text-gray-400 text-[10px] tracking-wider">
                Noise Level (Sigma)
              </label>
              <input 
                type="number" min="0" max="100" step="1"
                className="nodrag w-12 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-red-400 font-mono text-right outline-none focus:border-red-500 text-xs"
                value={form.sigma}
                onChange={(e) => setForm(s => ({ ...s, sigma: Number(e.target.value) }))}
              />
            </div>
            
            <input 
              type="range" min="0" max="100" step="1"
              className="nodrag nopan w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
              value={form.sigma}
              onChange={(e) => setForm(s => ({ ...s, sigma: Number(e.target.value) }))} 
            />
            
            <p className="text-[10px] text-gray-500 italic text-right">
              Higher sigma = Stronger denoising
            </p>
          </div>
          
          <div className="pt-2 border-t border-gray-700">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="DnCNN" />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
            <button 
              onClick={handleClose} 
              className="px-3 py-1.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition"
            >
              Cancel
            </button>
            <button 
              onClick={onSave} 
              className="px-3 py-1.5 rounded bg-red-600 text-white font-bold hover:bg-red-500 transition shadow-lg shadow-red-900/20"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default DnCNNNode;