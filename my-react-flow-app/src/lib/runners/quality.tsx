//src/lib/runners/quality.tsx
import { runBrisque, runPsnr, runSsim } from '../api';
import { producesNoImage } from '../nodeCatalog';
import { getNodeImageUrl, findInputImage } from './utils';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';

export async function runQuality(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const nodeId = node.id;
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);
  
  const nodeName = node.data.label || node.type?.toUpperCase() || 'Quality Node';

  const fail = async (msg: string) => {
    throw new Error(msg); 
  };



  if (node.type === 'brisque') {
    const incoming = getIncoming(nodeId);
    if (incoming.length < 1) return fail('No image input');

    const prevNode = nodes.find((n) => n.id === incoming[0].source);
    
    if (prevNode && producesNoImage(prevNode.type)) {
      const toolName = prevNode.data.label || prevNode.type;
      return fail(`Invalid Input: ${nodeName} requires an Image source, not a '${toolName}' result.`);
    }

    const imgUrl = findInputImage(nodeId, nodes, edges);

    if (!imgUrl) return fail('No input image found (Please check connection or run parent node).');


    try {
      const resp = await runBrisque(imgUrl);

      setNodes((nds) =>
        nds.map((x) =>
          x.id === nodeId
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'success',
                  description: `${nodeName} = ${Number(resp.score).toFixed(2)}`,
                  payload: {
                    ...(x.data as CustomNodeData)?.payload,
                    quality_score: resp.score,
                    json: resp,
                    output: resp
                  },
                } as CustomNodeData,
              }
            : x
        )
      );
    } catch (err: any) {
      await fail(err?.message || `${nodeName} failed`);
      return; 
    }
    return;
  }

 
  if (node.type === 'psnr' || node.type === 'ssim') {
    const incoming = getIncoming(nodeId);
    const e1 = incoming.find((e) => e.targetHandle === 'input1');
    const e2 = incoming.find((e) => e.targetHandle === 'input2');

    if (!e1 || !e2) return fail('Need two image inputs (Input 1 & Input 2)');

    const nodeA = nodes.find((x) => x.id === e1.source);
    const nodeB = nodes.find((x) => x.id === e2.source);

    const typeA = nodeA?.type || '';
    const typeB = nodeB?.type || '';

    const badInputs: string[] = [];
    
    if (producesNoImage(typeA)) {
        badInputs.push(`'${nodeA?.data.label || typeA}'`);
    }
    if (producesNoImage(typeB)) {
        badInputs.push(`'${nodeB?.data.label || typeB}'`);
    }

    if (badInputs.length > 0) {
      return fail(`Invalid Input: ${nodeName} requires Image sources, not a ${badInputs.join(' or ')} result.`);
    }

    const urlA = getNodeImageUrl(nodeA);
    const urlB = getNodeImageUrl(nodeB);

    if (!urlA || !urlB) return fail('No input image found (Please check connection or run parent node).');


    try {
      const runner = node.type === 'psnr' ? runPsnr : runSsim;
      const params = node.data.payload?.params;
      
      const resp = await runner(urlA, urlB, params);

      const desc =
        node.type === 'psnr'
          ? `PSNR = ${Number(resp.quality_score ?? resp.score).toFixed(2)} dB`
          : `SSIM = ${Number(resp.score).toFixed(4)}`;

      setNodes((nds) =>
        nds.map((x) =>
          x.id === nodeId
            ? {
                ...x,
                data: {
                  ...x.data,
                  status: 'success',
                  description: desc,
                  payload: {
                    ...(x.data as CustomNodeData)?.payload,
                    json: resp,
                    output: resp
                  },
                } as CustomNodeData,
              }
            : x
        )
      );
    } catch (err: any) {
      await fail(err?.message || 'Metric failed');
      return;
    }
  }
}