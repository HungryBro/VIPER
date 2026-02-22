// File: src/App.tsx
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

import Sidebar from './components/sidebar';
import FlowCanvas, { type FlowCanvasHandle } from './FlowCanvas';
import WorkflowControls from './components/WorkflowControls';
import WorkflowTabs from './components/WorkflowTabs';

import type { WorkflowTemplate } from './lib/workflowTemplates';
import type { WorkflowTab, NodeStatus } from './types'; 

const STORAGE_KEY_APP_TABS = 'n2n_app_tabs';
const STORAGE_KEY_ACTIVE_TAB = 'n2n_active_tab_id';

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  
  const isInitializing = useRef(true); 

  const [tabs, setTabs] = useState<WorkflowTab[]>(() => {
    try {
      const savedTabs = localStorage.getItem(STORAGE_KEY_APP_TABS);
      if (savedTabs) {
        const parsedTabs = JSON.parse(savedTabs);
        
        const cleanTabs = parsedTabs.map((tab: any) => ({
          ...tab,
          nodes: tab.nodes.map((node: any) => ({
            ...node,
            data: {
              ...node.data,
              status: 'idle' as NodeStatus 
            }
          }))
        }));
        
        localStorage.setItem(STORAGE_KEY_APP_TABS, JSON.stringify(cleanTabs));
        return cleanTabs;
      }
    } catch (e) {
      console.error("Failed to load tabs", e);
    }
    return [{ 
      id: 'tab-1', name: 'Workflow 1', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } 
    }];
  });
  
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_TAB) || 'tab-1';
  });

  const canvasRef = useRef<FlowCanvasHandle>(null);

  useEffect(() => {
    isInitializing.current = true;
    const timer = setTimeout(() => {
        isInitializing.current = false;
        localStorage.setItem(STORAGE_KEY_APP_TABS, JSON.stringify(tabs));
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isInitializing.current) return;

    try {
      const tabsToSave = tabs.map(tab => ({
        ...tab,
        nodes: tab.nodes.map(node => {
          const oldPayload = node.data.payload || {};
          let newPayload = undefined;

          if (node.type === 'image-input') {
             newPayload = oldPayload; 
          }
          else if (node.data.status === 'success') {
             const imgUrl = 
                oldPayload.vis_url || oldPayload.output_image ||         
                oldPayload.result_image_url || oldPayload.output?.image_url ||    
                oldPayload.output?.result_image_url || oldPayload.url || oldPayload.image_url;

             if (imgUrl) {
                const json = oldPayload.json || oldPayload.json_data || {};
                const imgMeta = json.image || {};
                
                const inputShape = imgMeta.original_shape || json.input_resolution || oldPayload.input_shape;
                const outputShape = imgMeta.enhanced_shape || imgMeta.processed_shape || imgMeta.processed_orb_shape || imgMeta.processed_sift_shape || imgMeta.processed_surf_shape || json.output_resolution || oldPayload.output_shape;

                newPayload = { 
                    vis_url: imgUrl,           
                    output_image: imgUrl,      
                    result_image_url: imgUrl,  
                    url: imgUrl,
                    input_shape: inputShape,
                    output_shape: outputShape,
                    params: oldPayload.params,
                    psnr: oldPayload.psnr,
                    ssim: oldPayload.ssim,
                    brisque: oldPayload.brisque,
                    json_data: { detections: json.detections }
                };
             } 
             else if (['psnr', 'ssim', 'brisque'].includes(node.type || '')) {
                newPayload = oldPayload;
             }
          }

          return {
            ...node,
            data: {
              ...node.data,
              payload: newPayload,
              status: 'idle' as NodeStatus 
            }
          };
        })
      }));

      localStorage.setItem(STORAGE_KEY_APP_TABS, JSON.stringify(tabsToSave));
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, activeTabId);

    } catch (e) {
      console.error("Failed to save tabs", e);
    }
  }, [tabs, activeTabId]);


  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      const currentTab = tabs.find(t => t.id === activeTabId);
      if (currentTab && canvasRef.current) {
        const cleanNodes = currentTab.nodes.map(n => ({
            ...n,
            data: { ...n.data, status: 'idle' as NodeStatus }
        }));
        canvasRef.current.restoreSnapshot(
          cleanNodes,
          currentTab.edges,
          currentTab.viewport
        );
      }
    }, 50); 
    return () => clearTimeout(timer);
  }, []); 


  const syncCanvasToCurrentTab = useCallback(() => {
    if (!canvasRef.current) return;
    const snapshot = canvasRef.current.getSnapshot();
    setTabs((prevTabs) => prevTabs.map((tab) => tab.id === activeTabId ? { ...tab, ...snapshot } : tab));
  }, [activeTabId]);

  const handleFlowChange = useCallback((changes: { nodes: any[], edges: any[], viewport: any }) => {
    if (isInitializing.current) return;

    setTabs((prevTabs) => 
      prevTabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        const safeNodes = changes.nodes.map(n => {
            if (!isRunning && n.data?.status === 'success') {
                return { ...n, data: { ...n.data, status: 'idle' as NodeStatus } };
            }
            return n;
        });
        return { ...tab, ...changes, nodes: safeNodes };
      })
    );
  }, [activeTabId, isRunning]);

  const handleLoadTemplate = useCallback((template: WorkflowTemplate) => {
    syncCanvasToCurrentTab();
    const newId = `tab-${Date.now()}`;
    const cleanNodes = template.nodes.map(n => ({ ...n, data: { ...n.data, status: 'idle' as NodeStatus } }));
    
    const newTab: WorkflowTab = {
      id: newId, name: template.name, nodes: cleanNodes, edges: template.edges, viewport: { x: 0, y: 0, zoom: 1 }
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setTimeout(() => { canvasRef.current?.restoreSnapshot(cleanNodes, template.edges, { x: 0, y: 0, zoom: 1 }); }, 0);
    setTimeout(() => { canvasRef.current?.fitView(); }, 200);
  }, [syncCanvasToCurrentTab]);

  const handleSwitchTab = (newTabId: string) => {
    if (newTabId === activeTabId) return;
    syncCanvasToCurrentTab();
    const targetTab = tabs.find((t) => t.id === newTabId);
    if (targetTab && canvasRef.current) {
      setActiveTabId(newTabId);
      setTimeout(() => {
        const cleanNodes = targetTab.nodes.map(n => ({ ...n, data: { ...n.data, status: 'idle' as NodeStatus } }));
        canvasRef.current?.restoreSnapshot(cleanNodes, targetTab.edges, targetTab.viewport);
      }, 0);
    }
  };

  const handleAddTab = () => {
    syncCanvasToCurrentTab();
    const newId = `tab-${Date.now()}`;
    const newTab: WorkflowTab = {
      id: newId, name: `Workflow ${tabs.length + 1}`, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setTimeout(() => { canvasRef.current?.restoreSnapshot([], [], { x: 0, y: 0, zoom: 1 }); }, 0);
  };

  const handleCloseTab = (targetId: string) => {
    if (tabs.length <= 1) { alert("At least one workflow must remain open."); return; }
    const targetIndex = tabs.findIndex(t => t.id === targetId);
    const newTabs = tabs.filter(t => t.id !== targetId);
    setTabs(newTabs);
    if (targetId === activeTabId) {
        const nextTab = newTabs[targetIndex - 1] || newTabs[0];
        setActiveTabId(nextTab.id);
        setTimeout(() => { canvasRef.current?.restoreSnapshot(nextTab.nodes, nextTab.edges, nextTab.viewport); }, 0);
    }
  };

  const handleRenameTab = (tabId: string, newName: string) => {
    setTabs((prevTabs) => prevTabs.map((tab) => tab.id === tabId ? { ...tab, name: newName || 'Untitled' } : tab));
  };

  const handleStart = useCallback(() => {
    const currentTab = tabs.find(t => t.id === activeTabId);
    
    if (!currentTab || currentTab.nodes.length === 0) {
      alert("Canvas is empty! Please add nodes before running.");
      return; 
    }

    setIsRunning(true);
  }, [tabs, activeTabId]);

  const handleStop = useCallback(() => setIsRunning(false), []);
  const activeTabName = tabs.find(t => t.id === activeTabId)?.name || 'Untitled';

  return (
    <div className="w-screen h-[100dvh] flex flex-col bg-gray-900 text-white overflow-hidden">
      <div className="relative z-30 bg-gray-900 shadow-lg border-b-2 border-teal-500 flex items-center justify-center p-3">
        <h1 className="text-2xl md:text-4xl font-extrabold text-teal-400 tracking-wide drop-shadow-md">Visual Image Processing & Evaluation Resource (VIPER)</h1>
      </div>
      <WorkflowControls isRunning={isRunning} onStart={handleStart} onStop={handleStop} />
      <WorkflowTabs tabs={tabs.map(t => ({ id: t.id, name: t.name }))} activeTabId={activeTabId} onSwitch={handleSwitchTab} onAdd={handleAddTab} onClose={handleCloseTab} onRename={handleRenameTab} />
      <div className="flex flex-grow overflow-hidden relative">
        <ReactFlowProvider>
          <Sidebar onLoadTemplate={handleLoadTemplate} />
          <div className="flex-1 h-full relative">
            <FlowCanvas ref={canvasRef} isRunning={isRunning} onPipelineDone={handleStop} onFlowChange={handleFlowChange} currentTabName={activeTabName} />
          </div>
        </ReactFlowProvider>
      </div>
    </div>
  );
}