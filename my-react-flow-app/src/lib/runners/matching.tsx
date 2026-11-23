// File: src/lib/runners/matching.tsx
import { runBfmatcher, runFlannmatcher, abs } from '../api';
import { nodeSpec } from '../nodeCatalog';
import type { Edge } from 'reactflow';
import type { RFNode, SetNodes } from './utils';
import type { CustomNodeData } from '../../types';
import { nodeResult } from '../nodeResult';

export async function runMatcher(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[]
) {
  const getIncoming = (id: string) => edges.filter((e) => e.target === id);

  const fail = async (msg: string) => {
    throw new Error(msg);
  };

  const findFeatureJson = (n?: RFNode): string | undefined => nodeResult(n)?.json;

  const getInputMeta = (n?: RFNode) => {
    const p = (n?.data as CustomNodeData | undefined)?.payload;
    if (!p) return { num_keypoints: 0, width: 0, height: 0, image_shape: [0, 0] };
    let shape = p.image_shape || p.json_data?.image?.original_shape || p.json?.image_shape || p.json?.image?.processed_shape; 
    let w = p.width; let h = p.height;
    if (Array.isArray(shape) && shape.length >= 2 && (!w || !h)) { h = shape[0]; w = shape[1]; }
    if ((!shape || !Array.isArray(shape)) && w && h) { shape = [h, w]; }
    return { num_keypoints: p.num_keypoints ?? p.kps_count ?? p.json?.num_keypoints ?? 0, image_shape: shape, width: w, height: h };
  };

  const incoming = getIncoming(node.id);
  const e1 = incoming.find((e) => e.targetHandle === 'file1');
  const e2 = incoming.find((e) => e.targetHandle === 'file2');

  if (!e1 || !e2) {
    await fail('Need two feature inputs. Please connect Feature Extraction nodes.');
  }

  const n1 = nodes.find(n => n.id === e1!.source);
  const n2 = nodes.find(n => n.id === e2!.source);
  
  const type1 = n1?.type || 'unknown';
  const type2 = n2?.type || 'unknown';

  if (nodeSpec(type1)?.output !== 'feature' || nodeSpec(type2)?.output !== 'feature') {
     await fail(`Invalid input: Requires SIFT/SURF/ORB nodes.`);
  }

  if (type1 !== type2) {
    await fail(`Mismatch: Cannot match '${type1.toUpperCase()}' with '${type2.toUpperCase()}'. Both inputs must be the same type.`);
  }

  if (type1 === 'orb' && type2 === 'orb') {
    const p1 = (n1?.data?.payload?.params as any) || {};
    const p2 = (n2?.data?.payload?.params as any) || {};

    const k1 = p1.WTA_K ?? 2;
    const k2 = p2.WTA_K ?? 2;

    if (Number(k1) !== Number(k2)) {
      await fail(
        `ORB Configuration Mismatch: Input 1 has WTA_K=${k1}, but Input 2 has WTA_K=${k2}. ` +
        `They must be identical to generate compatible descriptors.`
      );
    }
  }

  const jsonA = findFeatureJson(n1);
  const jsonB = findFeatureJson(n2);

  if (!jsonA || !jsonB) {
    await fail('Upstream features not ready. Please run the feature nodes first.');
  }

  const kind = node.type as 'bfmatcher' | 'flannmatcher';

  try {
    const params = ((node.data as CustomNodeData)?.payload?.params || {}) as Record<string, any>;
    let resp: any;

    if (kind === 'bfmatcher') {
      resp = await runBfmatcher(jsonA!, jsonB!, params);
    } else {
      const p = params || {};
      let indexMode: any = 'AUTO';
      let kdTrees, lshTableNumber, lshKeySize, lshMultiProbeLevel, searchChecks;

      if (p.index_params !== 'AUTO' && p.index_params != null) {
         const algo = String(p.index_params.algorithm).toUpperCase();
         if (algo.includes('KD')) {
            indexMode = 'KD_TREE'; kdTrees = p.index_params.trees;
         } else if (algo === 'LSH') {
            indexMode = 'LSH'; lshTableNumber = p.index_params.table_number;
            lshKeySize = p.index_params.key_size; lshMultiProbeLevel = p.index_params.multi_probe_level;
         }
      }
      if (p.search_params && p.search_params !== 'AUTO') searchChecks = p.search_params.checks;

      resp = await runFlannmatcher(jsonA!, jsonB!, {
        lowe_ratio: p.lowe_ratio,
        ransac_thresh: p.ransac_thresh,
        draw_mode: p.draw_mode,
        max_draw: p.max_draw,
        
        index_mode: indexMode,
        kd_trees: kdTrees,
        search_checks: searchChecks,
        
        lsh_table_number: lshTableNumber,
        lsh_key_size: lshKeySize,
        lsh_multi_probe_level: lshMultiProbeLevel,
      });
    }

    const meta1 = getInputMeta(n1);
    const meta2 = getInputMeta(n2);
    
    const rawVisUrl = resp.vis_url || resp.result_image_url;
    const fullVisUrl = rawVisUrl ? abs(rawVisUrl) : undefined;

    setNodes((nds) =>
      nds.map((x) =>
        x.id === node.id
          ? {
              ...x,
              data: {
                ...x.data,
                status: 'success',
                description: resp?.description || resp?.matching_statistics?.summary || `${kind.toUpperCase()} done`,
                payload: {
                  ...(x.data as CustomNodeData)?.payload,
                  ...resp,
                  
                  vis_url: fullVisUrl,
                  result_image_url: fullVisUrl,
                  
                  json: resp,
                  json_path: resp?.json_path,

                  input_features_details: {
                    image1: { 
                        num_keypoints: meta1.num_keypoints,
                        image_shape: meta1.image_shape,
                        width: meta1.width, height: meta1.height
                    },
                    image2: { 
                        num_keypoints: meta2.num_keypoints,
                        image_shape: meta2.image_shape,
                        width: meta2.width, height: meta2.height
                    }
                  },
                  inputs: {
                    image1: { width: meta1.width, height: meta1.height },
                    image2: { width: meta2.width, height: meta2.height }
                  },
                  output: {
                    match_json: resp.json_path,
                    vis_url: fullVisUrl,
                    json_url: resp.json_url
                  },
                  result: {
                    image: fullVisUrl,
                    preview: fullVisUrl,
                    json: typeof resp.json_path === 'string' && resp.json_path.endsWith('.json') ? resp.json_path : undefined,
                  },
                },
              } as CustomNodeData,
            }
          : x
      )
    );
  } catch (err: any) {
    console.error(`Matching Error:`, err);
    await fail(err.message || 'Matching failed');
  }
}