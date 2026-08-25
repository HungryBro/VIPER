// File: src/components/nodes/ImageInputNode.tsx
import { memo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { uploadImages, abs } from '../../lib/api';

const statusDot = (active: boolean, color: string) =>
  `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner transition-colors duration-200`;

type Props = NodeProps<CustomNodeData>;

const ImageInputNode = memo(({ id, data, selected }: Props) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { setNodes } = useReactFlow();
  const [localName, setLocalName] = useState<string>(data?.payload?.name || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>('');

  const onPick = () => fileRef.current?.click();

  const readImageSize = (url: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;

    setError('');
    setUploading(true);

    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, status: 'running' } } : n));

    try {
      const resp = await uploadImages(files);
      const f = resp.files[0];
      setLocalName(f.name);

      const absUrl = (abs(f.url) || f.url) as string;

      let dims = { width: 0, height: 0 };
      try {
        dims = await readImageSize(absUrl);
      } catch {
        // Image dimensions are optional; keep the zero-value fallback.
      }

      setNodes(nds => nds.map(n => n.id === id ? {
        ...n,
        data: {
          ...n.data,
          status: 'success',
          payload: {
            ...(n.data?.payload || {}),
            name: f.name,
            path: f.path,
            url: absUrl,
            result_image_url: absUrl,
            width: dims.width,
            height: dims.height
          },
          description: `Image uploaded (${dims.width}×${dims.height})`
        }
      } : n));
    } catch (err: any) {
      const msg = err?.message || 'Upload failed';
      setError(msg);
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, status: 'fault', description: msg } } : n));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const rawUrl = data?.payload?.result_image_url || data?.payload?.url;
  const displayUrl = rawUrl ? `${abs(rawUrl)}?t=${Date.now()}` : undefined;

  const isRunning = uploading || data?.status === 'running';

  const isSuccess = data?.status === 'success' || (!!rawUrl && !isRunning && data?.status !== 'fault');

  let borderColor = 'border-teal-500';
  if (selected) borderColor = 'border-teal-400 ring-2 ring-teal-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const handleClasses = `w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 transition-all duration-200 overflow-visible ${borderColor}`}>
      <Handle type="source" position={Position.Right} id="img" className={handleClasses} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-center font-bold p-2 text-teal-400 rounded-t-xl">
        {data?.label || 'Image Input'}
      </div>

      <div className="p-4 space-y-3">
        <div className="text-sm text-gray-300">Select an image to upload:</div>

        <button
          disabled={uploading}
          onClick={onPick}
          className={['w-full rounded-lg px-3 py-2 font-semibold transition-colors text-white', uploading ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-teal-600 hover:bg-teal-700'].join(' ')}
        >
          {uploading ? 'Uploading...' : 'Choose Image'}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.bmp,.webp,.tif,.tiff"
          onChange={onChange}
          className="hidden"
        />

        {(localName || data?.payload?.name) && (
          <div className="text-xs text-gray-400 break-all">
            File: <span className="text-gray-200">{localName || data?.payload?.name}</span>
          </div>
        )}

        {data?.payload?.width && (
          <div className="text-xs text-gray-400">
            {data.payload.width}×{data.payload.height}px
          </div>
        )}

        {displayUrl && (
          <img
            src={displayUrl}
            alt="preview"
            className="w-full rounded-md border border-gray-700 object-contain max-h-48 bg-gray-900"
            onError={(e) => {
              console.error("Image load failed:", e.currentTarget.src);
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        {error && <div className="text-xs text-red-400 font-bold">{error}</div>}
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1">
          <span className="text-red-400">start</span>
          <div className={statusDot(data?.status === 'start', 'bg-red-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-cyan-400">running</span>
          <div className={statusDot(isRunning, 'bg-cyan-400 animate-pulse')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-green-400">success</span>
          <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-yellow-400">fault</span>
          <div className={statusDot(false, 'bg-red-500')} />
        </div>
      </div>
    </div>
  );
});

export default ImageInputNode;
