// File: my-react-flow-app/src/lib/runners/utils.tsx
import { abs } from '../api';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '../../types';

export type RFNode = Node<CustomNodeData>;
export type SetNodes = Dispatch<SetStateAction<RFNode[]>>;

export async function markStartThenRunning(
  nodeId: string,
  label: string,
  setNodes: SetNodes
) {
  setNodes((nds) =>
    nds.map((x) =>
      x.id === nodeId
        ? { ...x, data: { ...x.data, status: 'start', description: `Start ${label}` } }
        : x
    )
  );

  await new Promise((r) => setTimeout(r, 200));

  setNodes((nds) =>
    nds.map((x) =>
      x.id === nodeId
        ? { ...x, data: { ...x.data, status: 'running', description: `Running ${label}` } }
        : x
    )
  );
}

export async function updateNodeStatus(
  nodeId: string,
  status: NodeStatus,
  setNodes: SetNodes
) {
  setNodes((nds) =>
    nds.map((n) => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, status: status } };
      }
      return n;
    })
  );
  await new Promise((r) => setTimeout(r, 50));
}

export function findInputImage(
  nodeId: string, 
  nodes: RFNode[], 
  edges: Edge[]
): string | undefined {
  const parents = edges
    .filter(e => e.target === nodeId && e.source !== nodeId)
    .map(e => nodes.find(n => n.id === e.source))
    .filter((parent): parent is RFNode => Boolean(parent?.data));

  for (const parent of parents) {
    if (parent.type === 'yolo-train') continue;
    const p = (parent.data.payload || parent.data.output) as any;
    if (!p) continue;
  
    if (typeof p.path === 'string') return p.path;
    if (typeof p.aligned_path === 'string') return p.aligned_path;
    if (typeof p.image_path === 'string') return p.image_path;
    if (typeof p.output_path === 'string') return p.output_path;

  
    if (typeof p.url === 'string' && (p.url.startsWith('/static') || p.url.startsWith('http'))) {
      return p.url;
    }
    if (typeof p.vis_url === 'string' && (p.vis_url.startsWith('/static') || p.vis_url.startsWith('http'))) {
      return p.vis_url;
    }
    if (typeof p.result_image_url === 'string' && (p.result_image_url.startsWith('/static') || p.result_image_url.startsWith('http'))) {
      return p.result_image_url;
    }

    if (typeof p.name === 'string' && !p.url?.startsWith('blob:')) {
      return p.name; 
    }

    if (typeof p.output_image === 'string') return p.output_image;
    if (typeof p.vis_url === 'string') return p.vis_url;
    if (typeof p.url === 'string') return p.url;
    if (typeof p.aligned_url === 'string') return p.aligned_url;

    if (p.output) {
       if (typeof p.output.aligned_image === 'string') return p.output.aligned_image;
       if (typeof p.output.aligned_path === 'string') return p.output.aligned_path;
    }
  }

  return undefined;
}

export async function fetchFileFromUrl(url: string, filename: string): Promise<File> {
  if (!url) throw new Error('Missing URL');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

export function getNodeImageUrl(n?: RFNode): string | undefined {
  if (!n) return undefined;
  const normalize = (u?: string) => u ? (/^(https?:|blob:|data:)/i.test(u) ? u : abs(u)) : undefined;

  const p = n.data?.payload as any;

  if (n.type === 'image-input') {
    return normalize(p?.result_image_url) ?? normalize(p?.url) ?? normalize(p?.preview_url);
  }
  
  if (['sift', 'surf', 'orb', 'bfmatcher', 'flannmatcher'].includes(n.type || '')) {
    return normalize(p?.result_image_url) ?? normalize(p?.vis_url);
  }
  
  return normalize(p?.output_image) 
      ?? normalize(p?.vis_url) 
      ?? normalize(p?.result_image_url)
      ?? normalize(p?.aligned_url)
      ?? normalize(p?.url)
      ?? normalize(p?.output?.aligned_url);
}

export function guard(canceledRef: MutableRefObject<boolean>) {
  if (canceledRef.current) throw new Error('Pipeline canceled');
}
