// src/lib/nodeCatalog.ts
// Every node VIPER knows, declared once. The sidebar, connection rules, run
// order and the canvas all read this list; nodeRegistry.tsx attaches the React
// component and the runner to each entry.
//
// Adding a node: add one entry here and one in nodeRegistry.tsx (the compiler
// rejects a catalog entry that has no implementation).

/** What flows along an edge. A node accepts an edge whose source produces one of its `inputs`. */
export type DataKind =
  | 'image' | 'images' | 'feature' | 'match' | 'mask' | 'metric' | 'dataset' | 'model'
  | 'none'   // produces nothing
  | 'any';   // accepts everything

export type NodeGroup = {
  name: string;
  /** Tailwind text colour of the group heading in the sidebar. */
  headerColor: string;
  /** Tailwind background colour of the group's node cards. */
  color: string;
  /**
   * false hides the whole group: its nodes are not offered in the sidebar and
   * the canvas does not register their components. Everything else (runner,
   * rules, components, backend router, template seed) stays in place, so the
   * group comes back by setting this to true, including its router in
   * server/main.py, and setting "enabled" on its template in both
   * server/official_templates.json and lib/templateInfo.ts.
   */
  enabled: boolean;
};

export const NODE_GROUPS = [
  { name: 'Input', headerColor: 'text-teal-400', color: 'bg-teal-600', enabled: true },
  { name: 'Enhancement', headerColor: 'text-indigo-500', color: 'bg-indigo-500', enabled: false },
  { name: 'Restoration', headerColor: 'text-red-500', color: 'bg-red-500', enabled: false },
  { name: 'Segmentation', headerColor: 'text-yellow-500', color: 'bg-yellow-500', enabled: false },
  { name: 'Feature Extraction', headerColor: 'text-green-500', color: 'bg-green-500', enabled: true },
  { name: 'Matching', headerColor: 'text-orange-500', color: 'bg-orange-500', enabled: true },
  { name: 'Object Alignment', headerColor: 'text-purple-500', color: 'bg-purple-500', enabled: true },
  { name: 'Classification', headerColor: 'text-pink-500', color: 'bg-pink-500', enabled: true },
  { name: 'Evaluation', headerColor: 'text-amber-400', color: 'bg-amber-600', enabled: true },
  { name: 'Object Detection & XAI', headerColor: 'text-cyan-400', color: 'bg-cyan-600', enabled: true },
  { name: 'Quality Assessment', headerColor: 'text-blue-500', color: 'bg-blue-500', enabled: true },
  { name: 'Saver', headerColor: 'text-gray-500', color: 'bg-gray-500', enabled: true },
] as const satisfies readonly NodeGroup[];

export type NodeGroupName = (typeof NODE_GROUPS)[number]['name'];

export type NodeSpec = {
  /** The `type` stored on the node in a workflow. */
  type: string;
  /** Older spellings of `type` still found in saved workflows. */
  aliases?: readonly string[];
  /** Name shown on the sidebar card. */
  label: string;
  group: NodeGroupName;
  inputs: readonly DataKind[];
  output: DataKind;
  /** Position in "run all": lower runs first. */
  order: number;
  /** Pause after this node during "run all", in ms. Heavy models need longer to settle. */
  settleMs?: number;
  /** false: "run all" skips it; it only runs from its own button. */
  runsInPipeline?: boolean;
  /**
   * Set when the node's payload holds what the user entered rather than a
   * computed result. When an upstream node re-runs, the payload is kept and this
   * text is shown, instead of the payload being cleared.
   */
  upstreamChangeNote?: string;
};

export const NODE_CATALOG = [
  // --- Input ---
  { type: 'image-input', label: 'Image Input', group: 'Input', inputs: [], output: 'image', order: 1 },
  { type: 'multi-image-input', label: 'Multi Image Input', group: 'Input', inputs: [], output: 'images', order: 1 },

  // --- Enhancement ---
  { type: 'clahe', label: 'CLAHE', group: 'Enhancement', inputs: ['image'], output: 'image', order: 20 },
  { type: 'msrcr', label: 'MSRCR Retinex', group: 'Enhancement', inputs: ['image'], output: 'image', order: 20 },
  { type: 'zeroDce', aliases: ['zero', 'zerodce', 'zero-dce', 'zero_dce'], label: 'Zero-DCE Lighten', group: 'Enhancement', inputs: ['image'], output: 'image', order: 20 },

  // --- Restoration ---
  { type: 'dncnn', aliases: ['dcnn'], label: 'DnCNN Denoise', group: 'Restoration', inputs: ['image'], output: 'image', order: 10 },
  { type: 'realesrgan', aliases: ['real', 'real-esrgan'], label: 'Real-ESRGAN', group: 'Restoration', inputs: ['image'], output: 'image', order: 10 },
  { type: 'swinir', label: 'SwinIR Transformer', group: 'Restoration', inputs: ['image'], output: 'image', order: 10 },

  // --- Segmentation ---
  { type: 'deeplab', aliases: ['deep'], label: 'DeepLab v3+', group: 'Segmentation', inputs: ['image'], output: 'image', order: 35, settleMs: 500 },
  { type: 'maskrcnn', aliases: ['mask'], label: 'Mask R-CNN', group: 'Segmentation', inputs: ['image'], output: 'image', order: 35, settleMs: 500 },
  { type: 'unet', label: 'U-Net', group: 'Segmentation', inputs: ['image'], output: 'image', order: 35, settleMs: 500 },

  // --- Feature Extraction ---
  { type: 'sift', label: 'SIFT', group: 'Feature Extraction', inputs: ['image'], output: 'feature', order: 40 },
  { type: 'surf', label: 'SURF', group: 'Feature Extraction', inputs: ['image'], output: 'feature', order: 40 },
  { type: 'orb', label: 'ORB', group: 'Feature Extraction', inputs: ['image'], output: 'feature', order: 40 },

  // --- Matching ---
  { type: 'bfmatcher', label: 'BFMatcher', group: 'Matching', inputs: ['feature'], output: 'match', order: 50 },
  { type: 'flannmatcher', label: 'FLANN Matcher', group: 'Matching', inputs: ['feature'], output: 'match', order: 50 },

  // --- Object Alignment ---
  { type: 'homography-align', label: 'Homography Align', group: 'Object Alignment', inputs: ['match'], output: 'image', order: 60 },
  { type: 'affine-align', label: 'Affine Align', group: 'Object Alignment', inputs: ['match'], output: 'image', order: 60 },

  // --- Classification ---
  { type: 'otsu', label: "Otsu's Threshold", group: 'Classification', inputs: ['image'], output: 'mask', order: 30 },
  { type: 'snake', label: 'Snake (Active Contour)', group: 'Classification', inputs: ['image'], output: 'mask', order: 30 },

  // --- Evaluation ---
  { type: 'classification-evaluation', label: 'Classification Evaluation', group: 'Evaluation', inputs: ['dataset', 'model', 'image'], output: 'metric', order: 90 },
  { type: 'detection-evaluation', label: 'Detection Evaluation', group: 'Evaluation', inputs: ['dataset', 'model'], output: 'metric', order: 90 },

  // --- Object Detection / XAI ---
  { type: 'yolo-dataset', label: 'YOLO Dataset Builder', group: 'Object Detection & XAI', inputs: ['images'], output: 'dataset', order: 2, upstreamChangeNote: 'Images updated — annotations ready to build.' },
  { type: 'yolo-train', label: 'YOLO Train', group: 'Object Detection & XAI', inputs: ['dataset'], output: 'model', order: 5 },
  { type: 'yolo-detect', label: 'YOLO Detect / Test', group: 'Object Detection & XAI', inputs: ['image', 'model'], output: 'image', order: 25 },
  { type: 'yolo-gradcam', label: 'YOLO Grad-CAM', group: 'Object Detection & XAI', inputs: ['image', 'model'], output: 'image', order: 30 },

  // --- Quality Assessment ---
  { type: 'brisque', label: 'BRISQUE', group: 'Quality Assessment', inputs: ['image'], output: 'metric', order: 90 },
  { type: 'psnr', label: 'PSNR', group: 'Quality Assessment', inputs: ['image', 'image'], output: 'metric', order: 90 },
  { type: 'ssim', label: 'SSIM', group: 'Quality Assessment', inputs: ['image', 'image'], output: 'metric', order: 90 },

  // --- Saver ---
  { type: 'save-image', label: 'Save Image', group: 'Saver', inputs: ['image', 'feature', 'match', 'metric', 'mask'], output: 'none', order: 99, runsInPipeline: false },
  { type: 'save-json', label: 'Save JSON', group: 'Saver', inputs: ['any'], output: 'none', order: 99, runsInPipeline: false },
] as const satisfies readonly NodeSpec[];

export type NodeType = (typeof NODE_CATALOG)[number]['type'];

const SPEC_BY_NAME = new Map<string, NodeSpec>();
for (const spec of NODE_CATALOG as readonly NodeSpec[]) {
  for (const name of [spec.type, ...(spec.aliases ?? [])]) SPEC_BY_NAME.set(name.toLowerCase(), spec);
}

const GROUP_BY_NAME = new Map<string, NodeGroup>(NODE_GROUPS.map((group) => [group.name, group]));

/** The catalog entry for a node type or one of its aliases, ignoring case. */
export function nodeSpec(type: string | undefined | null): NodeSpec | undefined {
  return type ? SPEC_BY_NAME.get(type.toLowerCase()) : undefined;
}

/** True when `type` is a known node that produces something other than an image. */
export function producesNoImage(type: string | undefined | null): boolean {
  const spec = nodeSpec(type);
  return spec !== undefined && spec.output !== 'image';
}

export function isNodeEnabled(spec: NodeSpec): boolean {
  return GROUP_BY_NAME.get(spec.group)?.enabled ?? false;
}

/** Sidebar contents: every enabled group with its nodes, in catalog order. */
export function sidebarGroups(): { name: string; headerColor: string; algorithms: { type: string; label: string; color: string }[] }[] {
  return NODE_GROUPS.filter((group) => group.enabled).map((group) => ({
    name: group.name,
    headerColor: group.headerColor,
    algorithms: (NODE_CATALOG as readonly NodeSpec[])
      .filter((spec) => spec.group === group.name)
      .map((spec) => ({ type: spec.type, label: spec.label, color: group.color })),
  }));
}
