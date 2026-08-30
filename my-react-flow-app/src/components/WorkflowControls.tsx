// project_n2n/my-react-flow-app/src/components/WorkflowControls.tsx
import React from 'react';

interface WorkflowControlsProps {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
}

const WorkflowControls: React.FC<WorkflowControlsProps> = ({ isRunning, onStart, onStop }) => {
  return (
    <div className="viper-workflow-controls flex items-center justify-between border-b-2 border-gray-700 bg-gray-800 px-3 py-2 sm:px-4">
      <div className="flex items-center space-x-2">
        <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-xs font-semibold text-gray-200 sm:text-sm">
          <span className="workflow-status-prefix hidden sm:inline">Status: </span>
          <span className={`${isRunning ? 'text-green-400' : 'text-red-400'} font-bold`}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </span>
      </div>

      <div className="flex space-x-1.5">
        <button
          onClick={onStart}
          disabled={isRunning}
          className={`flex min-h-10 touch-manipulation items-center space-x-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold shadow-md transition-all duration-200 sm:px-3 sm:text-sm
            ${isRunning ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white transform hover:scale-105'}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          <span className="workflow-control-label">Start</span>
        </button>

        <button
          onClick={onStop}
          disabled={!isRunning}
          className={`flex min-h-10 touch-manipulation items-center space-x-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold shadow-md transition-all duration-200 sm:px-3 sm:text-sm
            ${!isRunning ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white transform hover:scale-105'}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
          </svg>
          <span className="workflow-control-label">Stop</span>
        </button>
      </div>
    </div>
  );
};

export default WorkflowControls;
