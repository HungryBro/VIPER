// src/lib/nodeResult.ts
// What a node hands to the nodes connected after it.
//
// A runner (or, for input nodes, the upload) stores its result in
// `payload.result`. A node reading another node's output reads only that field,
// never the producer's other payload keys, which belong to its own display.
import type { Node } from 'reactflow';
import { nodeSpec } from './nodeCatalog';
import type { CustomNodeData } from '../types';

export type NodeResult = {
  /** The image the next node should process: a server path or a /static URL. */
  image?: string;
  /** The picture that shows this node's output. */
  preview?: string;
  /** The result JSON the next node reads: features for a matcher, matches for an aligner. */
  json?: string;
};

type AnyNode = Node<CustomNodeData> | undefined | null;

export function nodeResult(node: AnyNode): NodeResult | undefined {
  return node?.data?.payload?.result;
}

/**
 * Workflows saved before `payload.result` existed (browser tabs, workflow
 * files, templates in the database) carry the result only in the producer's
 * own keys. This reads it from them with the rules the readers used then.
 */
export function legacyResult(type: string | undefined, payload: Record<string, any> | undefined): NodeResult {
  const p = payload as any;
  if (!p) return {};
  const kind = nodeSpec(type)?.output;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  const served = (v: unknown) => {
    const s = str(v);
    return s && (s.startsWith('/static') || s.startsWith('http')) ? s : undefined;
  };

  let image: string | undefined;
  if (kind !== 'model') {
    image = str(p.path) ?? str(p.aligned_path) ?? str(p.image_path) ?? str(p.output_path)
      ?? served(p.url) ?? served(p.vis_url) ?? served(p.result_image_url)
      ?? (typeof p.name === 'string' && !p.url?.startsWith('blob:') ? p.name : undefined)
      ?? str(p.output_image) ?? str(p.vis_url) ?? str(p.url) ?? str(p.aligned_url)
      ?? str(p.output?.aligned_image) ?? str(p.output?.aligned_path);
  }

  let preview: string | undefined;
  if (type === 'image-input') preview = str(p.result_image_url) ?? str(p.url) ?? str(p.preview_url);
  else if (kind === 'feature' || kind === 'match') preview = str(p.result_image_url) ?? str(p.vis_url);
  else preview = str(p.output_image) ?? str(p.vis_url) ?? str(p.result_image_url) ?? str(p.aligned_url) ?? str(p.url) ?? str(p.output?.aligned_url);

  let json: string | undefined;
  if (kind === 'match') {
    const matchPath = str(p.output?.match_json) ?? str(p.json?.json_path) ?? str(p.json_path);
    json = matchPath?.endsWith('.json') ? matchPath : undefined;
  } else {
    json = str(p.json_path) ?? str(p.json_url);
  }

  return { image, preview, json };
}

/** A node loaded from storage, with `payload.result` filled in when it was saved without one. */
export function withResult<T extends Node<CustomNodeData>>(node: T): T {
  const payload = node.data?.payload;
  if (!payload || payload.result) return node;
  return { ...node, data: { ...node.data, payload: { ...payload, result: legacyResult(node.type, payload) } } };
}
