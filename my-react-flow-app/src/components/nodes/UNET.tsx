// File: src/components/nodes/UNET.tsx
import { memo, useEffect, useMemo, useState, useCallback } from "react";
import { Handle, Position, type NodeProps, useEdges, useReactFlow } from "reactflow";
import Modal from "../common/Modal";
import { abs, uploadImages } from "../../lib/api"; 
import type { CustomNodeData } from "../../types";
import { useNodeStatus } from '../../hooks/useNodeStatus';
import { ParameterLoader } from '../ParameterLoader'; 
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const DEFAULT_PARAMS = { ...NODE_DEFAULTS.unet };
type Params = typeof DEFAULT_PARAMS;

const ALLOWED_UNET_KEYS = ['threshold', 'model_path'];

const UNetNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);
  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const params = useMemo(() => {
    const p = data?.params || data?.payload?.params || {};
    const mPath = data?.model_path || data?.payload?.model_path || "";
    return { 
        threshold: p.threshold ?? DEFAULT_PARAMS.threshold,
        model_path: mPath 
    };
  }, [data?.params, data?.payload, data?.model_path]);

  const [form, setForm] = useState<Params>(params);
  
  useEffect(() => { if (!open) setForm(params); }, [params, open]);

  const handleOpen = useCallback(() => { setForm(params); setOpen(true); }, [params]);
  const handleClose = useCallback(() => { setForm(params); setOpen(false); }, [params]);

  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const source = loadedParams.unet_parameters_used || loadedParams;
    const cleanParams: Partial<Params> = {};
    let count = 0;

    ALLOWED_UNET_KEYS.forEach((k) => {
        const val = source[k];
        if (val !== undefined && val !== null) {
            if (k === 'model_path') {
                cleanParams.model_path = String(val);
                count++;
            } else if (k === 'threshold') {
                cleanParams.threshold = Number(val);
                count++;
            }
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for U-Net.");
        return;
    }

    setForm(prev => ({ ...prev, ...cleanParams }));
  }, []);

  const onSave = useCallback(() => {
    const finalParams = { threshold: form.threshold };
    const finalModelPath = form.model_path;

    rf.setNodes(nds => nds.map(n => 
      n.id === id ? { 
        ...n, 
        data: { 
          ...n.data, 
          params: finalParams, 
          model_path: finalModelPath, 
          payload: { 
            ...(n.data?.payload || {}), 
            model_path: finalModelPath, 
            params: finalParams 
          } 
        } 
      } : n
    ));
    setOpen(false);
  }, [rf, id, form]);

  const handleRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploading(true);
    try {
        const res = await uploadImages([file]); 
        if (res.files && res.files.length > 0) {
            const uploadedUrl = res.files[0].url;
            setForm(s => ({ ...s, model_path: uploadedUrl }));
        }
    } catch (err) {
        alert("Upload failed: " + err);
    } finally {
        setUploading(false);
    }
  };

  const visUrl = data?.payload?.vis_url;
  const maskUrl = data?.payload?.mask_url;
  const json_data = data?.payload?.json_data || data?.payload?.json || data?.payload;

  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;
  
  const caption = (isSuccess && data?.description) 
    ? data.description 
    : (displayUrl ? 'Segmentation complete' : 'Connect Image & Set Model');

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

  let borderColor = 'border-yellow-500';
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

      <div className="bg-gray-700 text-yellow-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>U-Net (Custom)</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
                isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-yellow-600 hover:bg-yellow-700'
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
        {displaySize && (
          <div className="text-[10px] text-gray-400 font-semibold tracking-tight">
            Dimensions: {displaySize}
          </div>
        )}

        {displayUrl && (
          <div className="relative group">
            <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />
            {maskUrl && (
                <div className="absolute top-2 right-2 w-8 h-8 border border-yellow-500/50 rounded overflow-hidden bg-black/50 hover:w-24 hover:h-24 hover:scale-110 transition-all duration-200 z-10 cursor-help shadow-lg">
                    <img src={abs(maskUrl)} className="w-full h-full object-cover opacity-90" title="Mask Output" />
                </div>
            )}
          </div>
        )}
        
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
        
        {params.model_path && (
            <div className="text-[9px] text-gray-500 font-mono truncate px-1 border-t border-gray-700 pt-1 mt-1">
                Model: <span className="text-yellow-600">{params.model_path.split(/[/\\]/).pop()}</span>
            </div>
        )}
      </div>

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="U-Net Settings" onClose={handleClose}>
        <div className="grid grid-cols-1 gap-5 text-xs text-gray-300">
          
          <div className="space-y-2">
             <label className="uppercase font-bold text-gray-400 text-[10px] tracking-wider">Model Path (.pth)</label>
             
             <label className={`flex items-center justify-center px-4 py-2 border border-gray-600 border-dashed rounded cursor-pointer hover:bg-gray-800 transition ${uploading ? 'opacity-50' : ''}`}>
                <span className="text-yellow-500 font-bold">
                    {uploading ? 'Uploading...' : '📂 Upload .pth File'}
                </span>
                <input type="file" accept=".pth,.pt" className="hidden" onChange={handleFileUpload} disabled={uploading} />
             </label>

             <input 
               type="text" 
               placeholder="e.g., weights/unet_car.pth"
               className="nodrag w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-white font-mono text-[10px] outline-none"
               value={form.model_path}
               onChange={(e) => setForm(s => ({ ...s, model_path: e.target.value }))}
             />
             <p className="text-[9px] text-gray-500">* Uploaded files are handled automatically.</p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="uppercase font-bold text-gray-400 text-[10px] tracking-wider">Binary Threshold</label>
              <input 
                type="number" step="0.01" min="0" max="1.0"
                className="nodrag w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white font-mono text-right outline-none focus:border-yellow-500"
                value={form.threshold}
                onChange={(e) => setForm(s => ({ ...s, threshold: Number(e.target.value) }))}
              />
            </div>
            <input 
              type="range" step="0.01" min="0" max="1.0" 
              className="nodrag nopan w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" 
              value={form.threshold} 
              onChange={(e) => setForm(s => ({ ...s, threshold: Number(e.target.value) }))} 
            />
          </div>
          
          <div className="pt-2 border-t border-gray-700">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="UNet_Segmentation" />
          </div>

        </div>

        <div className="flex justify-end gap-2 pt-5 border-t border-gray-700 mt-4">
          <button onClick={handleClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-yellow-600 text-white text-xs font-bold cursor-pointer hover:bg-yellow-500 transition">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default UNetNode;