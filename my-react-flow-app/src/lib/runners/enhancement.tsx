// File: src/lib/runners/enhancement.tsx
import { type Node, type Edge } from 'reactflow'; 
import { nodeSpec, producesNoImage } from '../nodeCatalog';
import { runCLAHE, runMSRCR, runZeroDCE, abs } from '../api';
import { findInputImage } from './utils';
import type { CustomNodeData } from '../../types';

type RFNode = Node<CustomNodeData>;
type SetNodes = (payload: RFNode[] | ((nds: RFNode[]) => RFNode[])) => void;

export async function runEnhancement(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const nodeLabel = node.data.label || node.type || 'Enhancement';

  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  const fail = async (msg: string) => {
    setNodes((nds: RFNode[]) =>
      nds.map((n: RFNode) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, description: msg } }
          : n
      )
    );
    throw new Error(msg);
  };

  const incoming = getIncoming(nodeId);
  if (incoming.length === 0) {
    return fail('No input connection (Please connect an Image source).');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);


  if (prevNode && producesNoImage(prevNode.type)) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: ${nodeLabel} requires a raw Image source, not a '${tool}' result.`);
  }

  const imagePath = findInputImage(nodeId, nodes, edges);
  if (!imagePath) {
    return fail('No input image found (Please check connection or run parent node).');
  }

  let prefix = '';
  let runner: any;
  switch (nodeSpec(node.type)?.type) {
    case 'clahe': prefix = 'CLAHE'; runner = runCLAHE; break;
    case 'msrcr': prefix = 'MSRCR'; runner = runMSRCR; break;
    case 'zeroDce': prefix = 'Zero-DCE'; runner = runZeroDCE; break;
    default: return fail(`Unknown Enhancement node type: ${node.type}`);
  }

  if (prevNode) {
    const prevPayload = prevNode.data.payload as any;
    const shape = prevPayload?.image_shape || prevPayload?.json_data?.image?.shape;
    let channels = 3; 

    if (Array.isArray(shape)) {
      if (shape.length === 2) channels = 1; 
      else if (shape.length === 3) channels = shape[2];
    } else if (prevPayload?.channels) {
      channels = prevPayload.channels;
    }

    if ((prefix === 'MSRCR' || prefix === 'Zero-DCE') && channels === 1) {
      return fail(`${prefix} requires a BGR color image`);
    }

    if (prefix === 'CLAHE' && channels !== 1 && shape) {
 
       return fail(`CLAHE requires grayscale image `);
    }
  }


  try {
    const params = node.data.payload?.params || {};
    const resp = await runner(imagePath, params);

    if (resp.detail || resp.status === 'error') {
      const errorMsg = typeof resp.detail === 'string' ? resp.detail : 'Processing failed';
      return fail(errorMsg); 
    }

    const visUrlRaw = resp.vis_url || resp.output_image || resp.result_image_url;
    if (!visUrlRaw) {
      return fail('No output image received.');
    }

    const visUrl = abs(visUrlRaw);

    setNodes((nds: RFNode[]) =>
      nds.map((n: RFNode) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                description: `${prefix} completed`,
                payload: {
                  ...(n.data as CustomNodeData)?.payload,
                  ...resp,
                  params,
                  vis_url: visUrl,
                  result_image_url: visUrl,
                  output_image: visUrl,
                  image_shape: resp.image_shape || resp.output?.shape || resp.shape,
                  json_data: resp,
                  result: { image: visUrl, preview: visUrl, json: resp.json_path ?? resp.json_url },
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Runner Error:`, err);
    
    const rawMsg = err?.message || 'Processing failed';
    
    if (rawMsg.includes(prefix) || rawMsg.includes('Invalid Input')) {
        await fail(rawMsg);
    } else {
        await fail(`${prefix} Error: ${rawMsg}`);
    }
  }
}