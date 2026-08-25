import { createContext, useContext } from 'react';

type RunContextValue = { runNode: (id: string) => void };

export const RunContext = createContext<RunContextValue | null>(null);

export function useRunNode() {
  const context = useContext(RunContext);
  if (!context) throw new Error('useRunNode must be used inside <RunProvider>');
  return context.runNode;
}
