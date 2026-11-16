// src/lib/nodeDefaults.ts
// Default parameters of every node, from nodeDefaults.json. That file is the
// one place they are written: tests/test_node_defaults.py checks the backend
// defaults against it.
import DEFAULTS from './nodeDefaults.json';
import { nodeSpec } from './nodeCatalog';

export const NODE_DEFAULTS = DEFAULTS;

type Params = Record<string, unknown>;

/** The defaults of a node type (or alias); an empty object for a node without settings. */
export function defaultParams(type: string | undefined | null): Params {
  const canonical = nodeSpec(type)?.type;
  const table = DEFAULTS as unknown as Record<string, Params | string>;
  const found = canonical ? table[canonical] : undefined;
  return typeof found === 'object' && found !== null ? found : {};
}
