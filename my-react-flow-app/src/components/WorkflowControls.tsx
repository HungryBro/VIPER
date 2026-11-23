// project_n2n/my-react-flow-app/src/components/WorkflowControls.tsx
import React from 'react';

interface WorkflowControlsProps {
  isRunning: boolean;
}

const WorkflowControls: React.FC<WorkflowControlsProps> = ({ isRunning }) => {
  return (
    <div className="viper-workflow-controls flex items-center border-b-2 border-gray-700 bg-gray-800 px-3 py-2 sm:px-4">
      <div className="flex items-center space-x-2">
        <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-xs font-semibold text-gray-200 sm:text-sm">
          <span className="workflow-status-prefix hidden sm:inline">Status: </span>
          <span className={`${isRunning ? 'text-green-400' : 'text-red-400'} font-bold`}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </span>
      </div>

    </div>
  );
};

export default WorkflowControls;
