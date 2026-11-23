// File: my-react-flow-app/src/lib/runners/segmentation.tsx
import { runDeepLab, runMaskRCNN, runUNET, abs } from '../api';
import { nodeSpec, producesNoImage } from '../nodeCatalog';
import { findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

export async function runSegmentation(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const nodeLabel = node.data.label || node.type || 'Segmentation';

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
    return fail('No input image found. Please connect and run an Image source.');
  }

  const prevNode = nodes.find((n) => n.id === incoming[0].source);

  if (prevNode && producesNoImage(prevNode.type)) {
    const tool = prevNode.data.label || prevNode.type;
    return fail(`Invalid Input: ${nodeLabel} requires a raw Image source, not a '${tool}' result.`);
  }

  const imagePath = findInputImage(nodeId, nodes, edges);
  if (!imagePath) {
    return fail('No input image found. Please connect and run an Image source.');
  }

  let prefix = '';
  let runner: any;

  switch (nodeSpec(node.type)?.type) {
    case 'deeplab':
      prefix = 'DeepLabv3+';
      runner = runDeepLab;
      break;
    case 'maskrcnn':
      prefix = 'Mask R-CNN';
      runner = runMaskRCNN;
      break;
    case 'unet':
      prefix = 'U-Net';
      runner = runUNET;
      break;
    default:
      return fail(`Unknown Segmentation node type: ${node.type}`);
  }


  try {
    const payload = node.data.payload || {};
    const params = payload.params || {};
    const modelPath = payload.model_path; 

    const resp = await runner(imagePath, params, modelPath);

    if (resp.detail || resp.status === 'error') {
      const errorMsg = typeof resp.detail === 'string' ? resp.detail : 'Processing failed';
      return fail(errorMsg); 
    }

   
    const visUrlRaw = resp.vis_url || resp.segmented_image || resp.full_vis_image || resp.output_image;
    
    if (!visUrlRaw) {
      return fail('No output image received from backend.');
    }

    const finalVisUrl = abs(visUrlRaw);
    
    const maskUrl = resp.mask_url ? abs(resp.mask_url) : undefined;

    setNodes((nds) =>
      nds.map((n) =>
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
                  
                  json: resp,
                  vis_url: finalVisUrl,
                  mask_url: maskUrl, 
                  
                  output_image: finalVisUrl, 
                  result_image_url: finalVisUrl,
                  
                  json_data: resp.json_data || resp,
                  result: { image: finalVisUrl, preview: finalVisUrl, json: resp.json_path ?? resp.json_url },
                },
              } as CustomNodeData,
            }
          : n
      )
    );
  } catch (err: any) {
    console.error(`${prefix} Segmentation Error:`, err);
    const rawMsg = err?.message || 'Processing failed';
    if (rawMsg.includes(prefix) || rawMsg.includes('Invalid Input')) {
        await fail(rawMsg);
    } else {
        await fail(`${prefix} Error: ${rawMsg}`);
    }
  }
}