// File: src/pages/LabPage.tsx (editor เดิมจาก src/App.tsx ย้ายมาเป็นหน้า /lab ใน T4)
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

import Sidebar from '../components/sidebar';
import FlowCanvas, { type FlowCanvasHandle } from '../FlowCanvas';
import WorkflowControls from '../components/WorkflowControls';
import WorkflowTabs from '../components/WorkflowTabs';
import LabHelpDialog from '../platform/LabHelpDialog';

import { sanitizeWorkflowDocument, type TemplateDetail } from '../lib/templateApi';
import { nodeSpec } from '../lib/nodeCatalog';
import { labBridge } from '../platform/labBridge';
import SaveTemplateDialog from '../platform/SaveTemplateDialog';
import type { WorkflowTab, NodeStatus } from '../types'; 

const STORAGE_KEY_APP_TABS = 'n2n_app_tabs';
const STORAGE_KEY_ACTIVE_TAB = 'n2n_active_tab_id';
const COMPACT_MOBILE_QUERY = '(max-width: 767px), (max-height: 560px) and (pointer: coarse)';

// `active` เป็น false เมื่อ editor ถูกเก็บ mount ไว้แต่ซ่อนอยู่หลัง route อื่น (ดู LabHost ใน src/App.tsx)
// งานที่รัน การแก้ undo/redo, Log panel และ clipboard จึงอยู่ครบเมื่อกลับมา
// platformMenu: LabHost ส่งมาเฉพาะโทรศัพท์แนวนอนที่ซ่อน header แพลตฟอร์มไว้ (B7b) ปุ่มนี้เปิด/ปิด header นั้น
type PlatformMenuToggle = { open: boolean; toggle: () => void };

export default function LabPage({ active = true, platformMenu }: { active?: boolean; platformMenu?: PlatformMenuToggle }) {
  const [isRunning, setIsRunning] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // ข้อความแจ้งสั้นๆ บน editor (เช่น เปิด template เป็นแท็บใหม่เบื้องหลังเพราะมีงานรันอยู่) หายเองใน 6 วินาที
  const [labNotice, setLabNotice] = useState<string | null>(null);
  // A4f: เพิ่มค่าเมื่อรายการ template ในคลังอาจเก่า (บันทึกจาก SAVE TEMPLATE หรือกลับมาที่ /lab)
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);
  const bumpTemplateList = useCallback(() => setTemplateRefreshKey((value) => value + 1), []);
  const [isCompactMobile, setIsCompactMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(COMPACT_MOBILE_QUERY).matches
  ));
  
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
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  useEffect(() => {
    isInitializing.current = true;
    const timer = setTimeout(() => {
        isInitializing.current = false;
        localStorage.setItem(STORAGE_KEY_APP_TABS, JSON.stringify(tabsRef.current));
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_MOBILE_QUERY);
    const syncCompactMode = () => setIsCompactMobile(mediaQuery.matches);
    syncCompactMode();
    mediaQuery.addEventListener('change', syncCompactMode);
    return () => mediaQuery.removeEventListener('change', syncCompactMode);
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
             // What the next node reads survives the reload; the rest is trimmed to keep storage small.
             const result = oldPayload.result;

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
                    json_data: { detections: json.detections },
                    result,
                };
             } 
             else if (nodeSpec(node.type)?.group === 'Quality Assessment') {
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
      const currentTab = tabsRef.current.find(t => t.id === activeTabIdRef.current);
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

  // อ่านสถานะรันล่าสุดใน callback ที่ถูกเก็บไว้ (labBridge เรียกผ่าน ref)
  const isRunningRef = useRef(isRunning);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const handleLoadTemplate = useCallback((template: { name: string; nodes: WorkflowTab['nodes']; edges: WorkflowTab['edges'] }) => {
    syncCanvasToCurrentTab();
    const newId = `tab-${Date.now()}`;
    const cleanNodes = template.nodes.map(n => ({ ...n, data: { ...n.data, status: 'idle' as NodeStatus } }));
    
    const newTab: WorkflowTab = {
      id: newId, name: template.name, nodes: cleanNodes, edges: template.edges, viewport: { x: 0, y: 0, zoom: 1 }
    };
    // มี pipeline รันอยู่ (A3 ผู้ใช้เลือกข้อ ข): เพิ่มแท็บใหม่ไว้เบื้องหลัง ไม่สลับแท็บและไม่ restore canvas
    // ผลของงานที่รันจึงอยู่ในแท็บเดิมครบ ผู้ใช้กดสลับไปแท็บใหม่เองเมื่อพร้อม
    if (isRunningRef.current) {
      setTabs((prev) => [...prev, newTab]);
      setLabNotice(`เปิด "${template.name}" เป็นแท็บใหม่แล้ว (ยังไม่สลับเพราะมี pipeline รันอยู่)`);
      return;
    }
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setTimeout(() => { canvasRef.current?.restoreSnapshot(cleanNodes, template.edges, 'fit'); }, 0);
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

  const getCurrentWorkflow = useCallback(() => {
    const snapshot = canvasRef.current?.getSnapshot();
    if (!snapshot) return null;
    return {
      name: activeTabName,
      workflow: sanitizeWorkflowDocument(snapshot.nodes, snapshot.edges),
    };
  }, [activeTabName]);

  const handleLoadPlatformTemplate = useCallback((template: TemplateDetail) => {
    handleLoadTemplate({ name: template.name, nodes: template.workflow.nodes, edges: template.workflow.edges });
  }, [handleLoadTemplate]);

  // template ที่หน้า Templates ส่งมาทาง labBridge (T13): เปิดเป็นแท็บใหม่ผ่าน handleLoadPlatformTemplate เดิม
  // รอจน editor active และ canvas พร้อม (รอบ mount แรกมี restore ที่ 50ms) take() ล้างค่าทันที จึงไม่เปิดซ้ำใน StrictMode
  const pendingTemplate = useSyncExternalStore(labBridge.subscribe, labBridge.peek);
  const loadPlatformTemplateRef = useRef(handleLoadPlatformTemplate);
  useEffect(() => {
    loadPlatformTemplateRef.current = handleLoadPlatformTemplate;
  }, [handleLoadPlatformTemplate]);
  useEffect(() => {
    if (!pendingTemplate || !active) return;
    const timer = setTimeout(() => {
      const template = labBridge.take();
      if (template) loadPlatformTemplateRef.current(template);
    }, 150);
    return () => clearTimeout(timer);
  }, [pendingTemplate, active]);

  useEffect(() => {
    if (!labNotice) return;
    const timer = setTimeout(() => setLabNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [labNotice]);

  const handleAddNodeFromLibrary = useCallback((nodeType: string) => {
    canvasRef.current?.addNode(nodeType);
  }, []);

  // กลับมาที่ /lab: รอให้ layout คำนวณขนาด canvas ใหม่ (หน้าต่างอาจเปลี่ยนขนาดระหว่างซ่อน) แล้ว fit view
  const wasActiveRef = useRef(active);
  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!becameActive) return;
    // ระหว่างซ่อน ผู้ใช้อาจแก้หรือลบ template ที่หน้า Templates: ให้คลังใน Lab โหลดรายการใหม่
    bumpTemplateList();
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => canvasRef.current?.fitView());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [active, bumpTemplateList]);

  return (
    <div className={`viper-app w-screen h-[100dvh] flex flex-col overflow-hidden bg-gray-900 text-white ${isCompactMobile ? 'compact-mobile' : ''}`}>
      {/* หัวของแพลตฟอร์ม (Header) แสดงอยู่เหนือ editor ใน LabHost แล้ว (ชื่อผู้ใช้ แผงจัดการผู้ใช้ของ admin และ Log out อยู่ที่นั่น) */}
      <div className="viper-header relative z-30 flex min-h-12 items-center gap-2 border-b-2 border-teal-500 bg-gray-900 px-3 shadow-lg sm:gap-3">
        <h1 className="min-w-0 flex-1 truncate text-base font-extrabold tracking-wide text-teal-400 sm:text-lg">VIPER Lab</h1>
        {platformMenu && (
          <button
            type="button"
            onClick={platformMenu.toggle}
            aria-expanded={platformMenu.open}
            aria-label={platformMenu.open ? 'ซ่อนเมนูแพลตฟอร์ม' : 'เมนูแพลตฟอร์ม (บัญชี หน้าอื่น ออกจากระบบ)'}
            title="เมนูแพลตฟอร์ม"
            className="flex h-9 shrink-0 touch-manipulation items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-2 text-[10px] font-bold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
          >
            {platformMenu.open ? 'ซ่อนเมนู' : 'เมนู'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="วิธีใช้ VIPER Lab"
          title="วิธีใช้ VIPER Lab"
          className="flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-sm font-bold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
        >
          ?
        </button>
        <button
          type="button"
          onClick={() => setSaveTemplateOpen(true)}
          className="flex h-9 shrink-0 touch-manipulation items-center justify-center rounded-md border border-teal-500/40 bg-teal-500/10 px-2 text-[10px] font-bold text-teal-300 hover:bg-teal-500/20"
        >
          SAVE TEMPLATE
        </button>
      </div>
      <WorkflowControls isRunning={isRunning} onStart={handleStart} onStop={handleStop} />
      <WorkflowTabs tabs={tabs.map(t => ({ id: t.id, name: t.name }))} activeTabId={activeTabId} onSwitch={handleSwitchTab} onAdd={handleAddTab} onClose={handleCloseTab} onRename={handleRenameTab} />
      <div className="flex flex-grow overflow-hidden relative">
        <ReactFlowProvider>
          <Sidebar
            getCurrentWorkflow={getCurrentWorkflow}
            onLoadPlatformTemplate={handleLoadPlatformTemplate}
            onAddNode={handleAddNodeFromLibrary}
            templateRefreshKey={templateRefreshKey}
          />
          <div className="flex-1 h-full relative">
            <FlowCanvas ref={canvasRef} isRunning={isRunning} onPipelineDone={handleStop} onFlowChange={handleFlowChange} currentTabName={activeTabName} active={active && !saveTemplateOpen && !helpOpen} />
          </div>
        </ReactFlowProvider>
      </div>
      {labNotice && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-4 left-1/2 z-[120] max-w-[90vw] -translate-x-1/2 rounded-md border border-teal-500/50 bg-gray-900/95 px-4 py-2 text-sm text-teal-200 shadow-lg"
        >
          {labNotice}
        </div>
      )}
      {helpOpen && <LabHelpDialog onClose={() => setHelpOpen(false)} />}
      {saveTemplateOpen && (
        <SaveTemplateDialog getCurrentWorkflow={getCurrentWorkflow} onClose={() => setSaveTemplateOpen(false)} onSaved={bumpTemplateList} />
      )}
    </div>
  );
}
