// File: src/lib/runners/features.tsx
import { runSift, runSurf, runOrb, abs } from '../api';
import { markStartThenRunning, updateNodeStatus, findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

export async function runFeature(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  const fail = async (msg: string) => {
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(msg);
  };

  const incoming = getIncoming(nodeId);
  if (incoming.length === 0) {
    return fail('No input connection (Please connect an Image source).');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);
  const BAD_SOURCES = ['sift', 'surf', 'orb', 'bfmatcher', 'flannmatcher', 'otsu', 'snake', 'psnr', 'ssim', 'brisque', 'save-json', 'save-image'];

  if (prevNode && BAD_SOURCES.includes(prevNode.type || '')) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: Feature Extraction requires a raw Image source, not a '${tool}' result.`);
  }

  const imagePath = findInputImage(nodeId, nodes, edges);

  if (!imagePath) {
    return fail('No input image found (Please check connection or run parent node).');
  }

  let prefix = '';
  let runner: any;

  switch (node.type) {
    case 'sift': prefix = 'SIFT'; runner = runSift; break;
    case 'surf': prefix = 'SURF'; runner = runSurf; break;
    case 'orb': prefix = 'ORB'; runner = runOrb; break;
    default: return;
  }

  await markStartThenRunning(nodeId, `Running ${prefix}`, setNodes);

  try {
    const params = node.data.payload?.params;
    const resp = await runner(imagePath, params);

    const num_keypoints = resp.num_keypoints ?? resp.kps_count ?? 0;
    const visUrl = resp.vis_url ? abs(resp.vis_url) : undefined;

    const foundShape = resp?.json_data?.image?.original_shape
      || resp?.image_shape
      || resp?.shape;

    const backendWarning = (resp?.feature_backend || resp?.json_data?.feature_backend) === 'SIFT_FALLBACK'
      ? 'SURF unavailable; used SIFT fallback'
      : undefined;

    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
            ...n,
            data: {
              ...n.data,
              status: 'success',
              description: backendWarning || `Found ${num_keypoints} keypoints`,
              payload: {
                ...(n.data as CustomNodeData)?.payload,
                ...resp,
                params,
                json: resp,
                json_url: resp.json_url,
                result_image_url: visUrl,
                vis_url: visUrl,
                output_image: visUrl,
                num_keypoints: num_keypoints,

                image_shape: foundShape,

                output: {
                  vis_url: visUrl,
                  json_url: resp.json_url,
                  num_keypoints: num_keypoints
                }
              },
            } as CustomNodeData,
          }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Error:`, err);
    await fail(err?.message || `${prefix} failed`);
  }
}