import type React from 'react';
import type { Edge, Node as RFNode } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { createYOLODataset } from '../api';

type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

export async function runYOLODatasetNode(node: RF, setNodes: SetNodes, nodes: RF[], edges: Edge[], signal?: AbortSignal) {
  const payload = node.data?.payload || {};
  const inputNode = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.source))
    .find((candidate) => candidate?.type === 'multi-image-input');
  const sourceImages = Array.isArray(inputNode?.data?.payload?.dataset_images) ? inputNode.data.payload.dataset_images : [];
  const annotationsByImage = payload.annotations_by_image || {};
  const images = sourceImages.map((image: any) => ({
    ...image,
    annotations: annotationsByImage[image.path] || [],
  }));
  const classNames = String(payload.class_names || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (images.length < 2) throw new Error('Upload at least 2 images for the YOLO dataset.');
  if (!classNames.length) throw new Error('Add one or more comma-separated class names.');
  if (!images.some((image: any) => Array.isArray(image.annotations) && image.annotations.length)) {
    throw new Error('Draw at least one bounding box before creating the dataset.');
  }

  const response = await createYOLODataset({
    images: images.map((image: any) => ({
      image_path: image.path || image.url,
      annotations: image.annotations || [],
    })),
    class_names: classNames,
  }, signal);

  setNodes((current) => current.map((item) => item.id === node.id ? {
    ...item,
    data: {
      ...item.data,
      status: 'success',
      description: `${response.image_count} images · ${response.class_names.length} class(es)`,
      payload: {
        ...(item.data.payload || {}),
        json: response,
        json_path: response.json_path,
        json_url: response.json_url,
        dataset_yaml: response.dataset_yaml,
        dataset_yaml_url: response.dataset_yaml_url,
      },
    },
  } : item));
}
