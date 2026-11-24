// File: src/hooks/useNodeStatus.ts
import { useMemo } from 'react';
import type { CustomNodeData } from '../types';

export const useNodeStatus = (data: CustomNodeData | undefined) => {
  return useMemo(() => {
    const status = data?.status;
    const payload = data?.payload;
    
    const isRunning = status === 'start' || status === 'running';
    const isFault = status === 'fault';

    const hasResult = !!(
        payload?.result_image_url || 
        payload?.json_url || 
        payload?.url || 
        payload?.output ||
        payload?.mask_url ||
        payload?.overlay_url
    );

    const isSuccess = status === 'success' || (hasResult && !isRunning && !isFault);

    return {
      isRunning,
      isFault,
      isSuccess,
      statusDot: (active: boolean, color: string) => 
        `h-[6.5px] w-[6.5px] rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner transition-colors duration-200`
    };
  }, [data]);
};