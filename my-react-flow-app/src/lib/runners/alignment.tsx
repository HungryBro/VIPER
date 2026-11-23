// src/lib/runners/alignment.tsx
import { runHomographyAlignment, runAffineAlignment, abs } from '../api';
import { nodeSpec } from '../nodeCatalog';
import type { Edge } from 'reactflow';
import type { Node as RFNode } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import { nodeResult } from '../nodeResult';

type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

function getIncoming(edges: Edge[], id: string) {
  return edges.filter((e) => e.target === id);
}

function pickMatchJsonFromNode(matchNode?: RF): string | null {
  const matchPath = nodeResult(matchNode)?.json;
  return matchPath?.endsWith('.json') ? matchPath : null;
}

function getNodeParams<T extends object = Record<string, any>>(node: RF): T {
  return ((node.data?.payload?.params as T) ?? ({} as T));
}

export async function runAlignment(
  node: RF,
  setNodes: SetNodes,
  nodes: RF[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const kind = node.type || 'homography-align';

  const incoming = getIncoming(edges, nodeId);
  if (!incoming.length) {
    const msg = 'No input connection. Please connect a Matcher node (BF/FLANN).';
    throw new Error(msg);
  }

  const srcEdge = incoming[0];
  const matchNode = nodes.find((n) => n.id === srcEdge.source);

  if (!matchNode || nodeSpec(matchNode.type)?.output !== 'match') {
    const label = matchNode?.data?.label || matchNode?.type || 'Unknown Node';
    const msg = `Invalid Input: Alignment requires a Matcher node, not a '${label}' result.`;
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, description: msg } } : n));
    throw new Error(msg);
  }
  
  const matchJson = pickMatchJsonFromNode(matchNode);
  if (!matchJson) {
    const msg = 'Matcher output not ready. Please Run the Matcher node first.';
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, description: msg } } : n));
    throw new Error(msg);
  }

  const rawParams = getNodeParams(node);
  const params = {
      ...rawParams,
      ransac_thresh: Number(rawParams.ransac_thresh) || 3.0,
      confidence: Number(rawParams.confidence) || 0.99,
      refine_iters: rawParams.refine_iters !== undefined ? Number(rawParams.refine_iters) : 10 
  };

  try {
    let resp: any;

    if (kind === 'affine-align') {
      resp = await runAffineAlignment(matchJson, params);
    } else {
      resp = await runHomographyAlignment(matchJson, params);
    }

    const alignedPath = resp?.output?.aligned_path;
    const alignedUrl = resp?.output?.aligned_url ? abs(resp.output.aligned_url) : undefined;
    const inliers = typeof resp?.num_inliers === 'number' ? resp.num_inliers : (resp?.inliers ?? '?');

    setNodes((nds) =>
      nds.map((x) =>
        x.id === nodeId
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: `${kind === 'affine-align' ? 'Affine' : 'Homography'} aligned (${inliers} inliers)`,
                payload: {
                  ...(x.data?.payload || {}),
                  
                  tool: kind === 'affine-align' ? 'AffineAlignment' : 'HomographyAlignment',
                  output_type: 'alignment', 
                  params,
                  
                  json: resp, 
                  json_data: resp, 
                  
                  aligned_url: alignedUrl, 
                  vis_url: alignedUrl, 
                  result_image_url: alignedUrl,
                  output_image: alignedUrl, 
                  
                  image_shape: resp.image_shape || resp.output?.aligned_shape,
                  channels: resp.channels || (resp.image_shape ? resp.image_shape[2] : 3),

                  json_path: resp?.json_path,
                  aligned_path: alignedPath,
                  output: resp, 
                  result: { image: alignedPath ?? alignedUrl, preview: alignedUrl, json: resp?.json_path },
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    console.error("Alignment Error:", err);
    const errMsg = err.response?.data?.detail || err.message || "Alignment Failed";
    setNodes((nds) => nds.map(n => n.id === nodeId ? {
        ...n, data: { ...n.data, description: errMsg }
    } : n));
    throw err;
  }
}