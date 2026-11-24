// project_n2n/my-react-flow-app/src/components/WorkflowControls.tsx
import React from 'react';

interface WorkflowControlsProps {
  isRunning: boolean;
}

const WorkflowControls: React.FC<WorkflowControlsProps> = ({ isRunning }) => {
  return (
    <div className="viper-workflow-controls flex shrink-0 items-center">
      <div className="flex items-center space-x-1.5">
        <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-[var(--lab-teal)] animate-pulse' : 'bg-[var(--lab-danger)]'}`} />
        <span className="text-xs font-medium text-[var(--lab-muted)]">
          <span className="workflow-status-prefix hidden sm:inline">Status: </span>
          <span className={`${isRunning ? 'text-[var(--lab-teal)]' : 'text-[var(--lab-danger)]'} font-semibold`}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </span>
      </div>

    </div>
  );
};

export default WorkflowControls;
