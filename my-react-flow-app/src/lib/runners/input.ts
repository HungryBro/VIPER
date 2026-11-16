// src/lib/runners/input.ts
// Input nodes have nothing to compute: running one confirms it holds its data.
import type { RFNode, SetNodes } from './utils';

function markSuccess(nodeId: string, setNodes: SetNodes) {
  setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'success' } } : n)));
}

export async function runImageInput(node: RFNode, setNodes: SetNodes) {
  if (!node.data.payload?.url) throw new Error('No image uploaded yet.');
  markSuccess(node.id, setNodes);
  await new Promise((r) => setTimeout(r, 100));
}

export async function runMultiImageInput(node: RFNode, setNodes: SetNodes) {
  if (!node.data.payload?.dataset_images?.length) throw new Error('No images uploaded yet.');
  markSuccess(node.id, setNodes);
}
