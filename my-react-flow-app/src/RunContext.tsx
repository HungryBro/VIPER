// File: my-react-flow-app/src/RunContext.tsx
import React from 'react';
import { RunContext } from './runContextState';

export const RunProvider: React.FC<{ runNode: (id: string) => void; children: React.ReactNode }> = ({ runNode, children }) => {
  return <RunContext.Provider value={{ runNode }}>{children}</RunContext.Provider>;
};
