// File: my-react-flow-app/src/lib/runners/utils.tsx
import { abs } from '../api';
import { nodeResult } from '../nodeResult';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../../types';

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

  // Let the "start" state paint before switching to "running".
  await new Promise((r) => setTimeout(r, 200));

  setNodes((nds) =>
    nds.map((x) =>
      x.id === nodeId
        ? { ...x, data: { ...x.data, status: 'running', description: `Running ${label}` } }
        : x
    )
  );
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
    const image = nodeResult(parent)?.image;
    if (image) return image;
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

  return normalize(nodeResult(n)?.preview);
}

export function guard(canceledRef: MutableRefObject<boolean>) {
  if (canceledRef.current) throw new Error('Pipeline canceled');
}
