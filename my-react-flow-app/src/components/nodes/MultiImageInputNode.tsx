import { memo, useRef, useState, type ChangeEvent } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs, uploadImages } from '../../lib/api';

type DatasetImage = {
  name: string;
  path: string;
  url: string;
  width: number;
  height: number;
};

const MultiImageInputNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const { setNodes } = useReactFlow();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const images = (Array.isArray(data?.payload?.dataset_images) ? data.payload.dataset_images : []) as DatasetImage[];

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const response = await uploadImages(files);
      const uploaded = await Promise.all(response.files.map(async (file: any) => {
        const url = (abs(file.url) || file.url) as string;
        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve({ width: 0, height: 0 });
          image.src = url;
        });
        return { name: file.name, path: file.path, url, ...dimensions };
      }));
      setNodes((nodes) => nodes.map((node) => node.id === id ? {
        ...node,
        data: {
          ...node.data,
          status: 'success',
          description: `${uploaded.length} image(s) uploaded`,
          payload: { ...(node.data.payload || {}), dataset_images: uploaded },
        },
      } : node));
    } catch (cause: any) {
      const message = cause?.message || 'Could not upload images.';
      setError(message);
      setNodes((nodes) => nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, status: 'fault', description: message } } : node));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={`w-72 rounded-xl border-2 bg-gray-800 text-gray-200 shadow-2xl ${selected ? 'border-teal-400 ring-2 ring-teal-500' : 'border-teal-500'}`}>
      <Handle type="source" position={Position.Right} id="images" className="h-3 w-3 border-2 border-gray-400 bg-white" />
      <div className="rounded-t-lg bg-gray-700 p-2 text-center font-bold text-teal-400">Multi Image Input</div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-gray-300">Upload images for a YOLO training dataset.</p>
        <button disabled={uploading} onClick={() => fileRef.current?.click()} className="nodrag w-full rounded bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-wait disabled:bg-yellow-700">
          {uploading ? 'Uploading…' : 'Choose multiple images'}
        </button>
        <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.bmp,.webp,.tif,.tiff" onChange={onUpload} className="hidden" />
        <p className="text-xs text-gray-400">{images.length ? `${images.length} image(s) ready for annotation` : 'No images uploaded yet'}</p>
        {!!images.length && <div className="max-h-24 overflow-y-auto rounded bg-gray-900 p-2 text-[10px] text-gray-300">
          {images.map((image, index) => <div key={`${image.path}-${index}`} className="truncate">{index + 1}. {image.name}</div>)}
        </div>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
});

export default MultiImageInputNode;
