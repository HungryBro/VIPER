// src/components/sidebar.tsx
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { TEMPLATES, type WorkflowTemplate } from '../lib/workflowTemplates';
import AlgorithmInfoModal from './modals/AlgorithmInfoModal';

interface TemplateJobGroup {
  name: string;
  headerColor: string;
  templates: WorkflowTemplate[];
  sortOrder: number;
}

interface SidebarProps {
  onLoadTemplate: ((template: WorkflowTemplate) => void) | null;
}

// --- Icons ---
const Icons: Record<string, React.FC<{ className?: string }>> = {
  Input: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Template: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  )
};

const Sidebar = ({ onLoadTemplate }: SidebarProps) => {

  const [activeTab, setActiveTab] = useState<'nodes' | 'templates'>('nodes');
  const [openNodeGroups, setOpenNodeGroups] = useState<Record<string, boolean>>({});
  const [openTemplateGroups, setOpenTemplateGroups] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    template: null as WorkflowTemplate | null,
  });

  const [aboutModal, setAboutModal] = useState({
    visible: false,
    template: null as WorkflowTemplate | null,
  });

  useEffect(() => {
    const close = () => setContextMenu((c) => ({ ...c, visible: false }));
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const openContextMenu = (event: React.MouseEvent, t: WorkflowTemplate) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      template: t,
    });
  };

  const getTemplateStyles = (color: string) => {
    const colorMap: Record<string, { border: string, stripe: string, text: string, hoverText: string }> = {
      green: { border: 'hover:border-green-500/50', stripe: 'bg-green-500', text: 'text-green-400', hoverText: 'group-hover:text-green-300' },
      pink: { border: 'hover:border-pink-500/50', stripe: 'bg-pink-500', text: 'text-pink-400', hoverText: 'group-hover:text-pink-300' },
      orange: { border: 'hover:border-orange-500/50', stripe: 'bg-orange-500', text: 'text-orange-400', hoverText: 'group-hover:text-orange-300' },
      purple: { border: 'hover:border-purple-500/50', stripe: 'bg-purple-500', text: 'text-purple-400', hoverText: 'group-hover:text-purple-300' },
      blue: { border: 'hover:border-blue-500/50', stripe: 'bg-blue-500', text: 'text-blue-400', hoverText: 'group-hover:text-blue-300' },
      
      indigo: { border: 'hover:border-indigo-500/50', stripe: 'bg-indigo-500', text: 'text-indigo-400', hoverText: 'group-hover:text-indigo-300' },
      red: { border: 'hover:border-red-500/50', stripe: 'bg-red-500', text: 'text-red-400', hoverText: 'group-hover:text-red-300' },
      yellow: { border: 'hover:border-yellow-500/50', stripe: 'bg-yellow-500', text: 'text-yellow-400', hoverText: 'group-hover:text-yellow-300' },
      
      teal: { border: 'hover:border-teal-500/50', stripe: 'bg-teal-500', text: 'text-teal-400', hoverText: 'group-hover:text-teal-300' },
      cyan: { border: 'hover:border-cyan-500/50', stripe: 'bg-cyan-500', text: 'text-cyan-400', hoverText: 'group-hover:text-cyan-300' },
      rose: { border: 'hover:border-rose-500/50', stripe: 'bg-rose-500', text: 'text-rose-400', hoverText: 'group-hover:text-rose-300' },
    };
    return colorMap[color] || colorMap['teal'];
  };

  const onDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  const jobs = useMemo(() => ([
    { 
      name: 'Input', 
      headerColor: 'text-teal-400', 
      algorithms: [
        { type: 'image-input', label: 'Image Input', color: 'bg-teal-600' },
        { type: 'multi-image-input', label: 'Multi Image Input', color: 'bg-teal-600' },
      ]
    },
    // { 
    //   name: 'Enhancement', 
    //   headerColor: 'text-indigo-500', 
    //   algorithms: [
    //     { type: 'clahe', label: 'CLAHE', color: 'bg-indigo-500' }, 
    //     { type: 'msrcr', label: 'MSRCR Retinex', color: 'bg-indigo-500' }, 
    //     { type: 'zeroDce', label: 'Zero-DCE Lighten', color: 'bg-indigo-500' }
    //   ] 
    // },
    // { 
    //   name: 'Restoration', 
    //   headerColor: 'text-red-500', 
    //   algorithms: [
    //     { type: 'dncnn', label: 'DnCNN Denoise', color: 'bg-red-500' }, 
    //     { type: 'realesrgan', label: 'Real-ESRGAN', color: 'bg-red-500' }, 
    //     { type: 'swinir', label: 'SwinIR Transformer', color: 'bg-red-500' }
    //   ] 
    // },
    // { 
    //   name: 'Segmentation', 
    //   headerColor: 'text-yellow-500', 
    //   algorithms: [
    //     { type: 'deeplab', label: 'DeepLab v3+', color: 'bg-yellow-500' }, 
    //     { type: 'maskrcnn', label: 'Mask R-CNN', color: 'bg-yellow-500' }, 
    //     { type: 'unet', label: 'U-Net', color: 'bg-yellow-500' }
    //   ] 
    // },
    { 
      name: 'Feature Extraction', 
      headerColor: 'text-green-500', 
      algorithms: [
        { type: 'sift', label: 'SIFT', color: 'bg-green-500' }, 
        { type: 'surf', label: 'SURF', color: 'bg-green-500' }, 
        { type: 'orb', label: 'ORB', color: 'bg-green-500' }
      ] 
    },
    { 
      name: 'Matching', 
      headerColor: 'text-orange-500', 
      algorithms: [
        { type: 'bfmatcher', label: 'BFMatcher', color: 'bg-orange-500' }, 
        { type: 'flannmatcher', label: 'FLANN Matcher', color: 'bg-orange-500' }
      ] 
    },
    { 
      name: 'Object Alignment', 
      headerColor: 'text-purple-500', 
      algorithms: [
        { type: 'homography-align', label: 'Homography Align', color: 'bg-purple-500' }, 
        { type: 'affine-align', label: 'Affine Align', color: 'bg-purple-500' }
      ] 
    },
    { 
      name: 'Classification', 
      headerColor: 'text-pink-500', 
      algorithms: [
        { type: 'otsu', label: "Otsu's Threshold", color: 'bg-pink-500' }, 
        { type: 'snake', label: 'Snake (Active Contour)', color: 'bg-pink-500' }
      ] 
    },
    {
      name: 'Object Detection & XAI',
      headerColor: 'text-cyan-400',
      algorithms: [
        { type: 'yolo-dataset', label: 'YOLO Dataset Builder', color: 'bg-cyan-600' },
        { type: 'yolo-train', label: 'YOLO Train', color: 'bg-cyan-600' },
        { type: 'yolo-detect', label: 'YOLO Detect / Test', color: 'bg-cyan-600' },
        { type: 'yolo-gradcam', label: 'YOLO Grad-CAM', color: 'bg-cyan-600' },
      ],
    },
    { 
      name: 'Quality Assessment', 
      headerColor: 'text-blue-500', 
      algorithms: [
        { type: 'brisque', label: 'BRISQUE', color: 'bg-blue-500' }, 
        { type: 'psnr', label: 'PSNR', color: 'bg-blue-500' }, 
        { type: 'ssim', label: 'SSIM', color: 'bg-blue-500' }
      ] 
    },
    { 
      name: 'Saver', 
      headerColor: 'text-gray-500', 
      algorithms: [
        { type: 'save-image', label: 'Save Image', color: 'bg-gray-500' }, 
        { type: 'save-json', label: 'Save JSON', color: 'bg-gray-500' }
      ] 
    }
  ]), []);

  const templateJobs = useMemo(() => {
    const groups: Record<string, TemplateJobGroup> = {};

    TEMPLATES.forEach(t => {
      let key = 'Other';
      let headerColor = 'text-teal-400';
      let sortOrder = 99;

      // if (t.color === 'indigo') { 
      //   key = 'Enhancement'; 
      //   headerColor = 'text-indigo-400'; 
      //   sortOrder = 1; 
      // }
      // else if (t.color === 'red') { 
      //   key = 'Restoration'; 
      //   headerColor = 'text-red-400'; 
      //   sortOrder = 2; 
      // }
      // else if (t.color === 'yellow') { 
      //   key = 'Segmentation'; 
      //   headerColor = 'text-yellow-400'; 
      //   sortOrder = 3; 
      // }
      if (t.color === 'green') { key = 'Feature Extraction'; headerColor = 'text-green-400'; sortOrder = 4; }
      else if (t.color === 'orange') { key = 'Matching'; headerColor = 'text-orange-400'; sortOrder = 5; }
      else if (t.color === 'purple') { key = 'Object Alignment'; headerColor = 'text-purple-400'; sortOrder = 6; }
      else if (t.color === 'pink') { key = 'Classification'; headerColor = 'text-pink-400'; sortOrder = 7; }
      else if (t.color === 'blue') { key = 'Quality Assessment'; headerColor = 'text-blue-400'; sortOrder = 8; }

      const cleanName = t.name.replace(/Lesson \d+: /g, '').trim();

      if (!groups[key]) groups[key] = { name: key, headerColor, templates: [], sortOrder };
      groups[key].templates.push({ ...t, name: cleanName });
    });

    return Object.values(groups).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);

  const toggleNodeGroup = (name: string) => setOpenNodeGroups(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleTemplateGroup = (name: string) => setOpenTemplateGroups(prev => ({ ...prev, [name]: !prev[name] }));

  const expandAll = useCallback(() => {
    if (activeTab === 'nodes') {
      const next: Record<string, boolean> = {};
      jobs.forEach(j => next[j.name] = true);
      setOpenNodeGroups(next);
    } else {
      const next: Record<string, boolean> = {};
      templateJobs.forEach(j => next[j.name] = true);
      setOpenTemplateGroups(next);
    }
  }, [activeTab, jobs, templateJobs]);

  const collapseAll = useCallback(() => {
    if (activeTab === 'nodes') setOpenNodeGroups({});
    else setOpenTemplateGroups({});
  }, [activeTab]);

  return (
    <>
      <aside className={['border-r border-gray-800 bg-gray-900 h-full shadow-2xl flex flex-col transition-all duration-300 z-20', collapsed ? 'w-14' : 'w-72'].join(' ')}>
        
        <div className="flex items-center justify-between p-3 border-b border-gray-800">
          {!collapsed && <div className="text-sm font-bold text-teal-400 uppercase tracking-widest">VIPER Library</div>}
          <button onClick={() => setCollapsed(s => !s)} className="h-8 w-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center border border-gray-700">
            <svg className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
          </button>
        </div>

        {!collapsed && (
          <div className="flex p-2 gap-1 border-b border-gray-800">
            <button onClick={() => setActiveTab('nodes')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 transition-all ${activeTab === 'nodes' ? 'bg-teal-600/20 text-teal-400 border border-teal-500/50' : 'text-gray-500 hover:bg-gray-800'}`}>
              <Icons.Input className="w-3 h-3" /> NODES
            </button>
            <button onClick={() => setActiveTab('templates')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 transition-all ${activeTab === 'templates' ? 'bg-teal-600/20 text-teal-400 border border-teal-500/50' : 'text-gray-500 hover:bg-gray-800'}`}>
              <Icons.Template className="w-3 h-3" /> TEMPLATES
            </button>
          </div>
        )}

        {!collapsed ? (
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            <div className="px-1 pb-2 flex gap-2 mb-1 mt-1">
              <button onClick={expandAll} className="flex-1 text-[9px] font-bold px-2 py-1 rounded bg-gray-800 text-gray-500 hover:text-white hover:bg-gray-700 border border-gray-700 transition-colors">OPEN ALL</button>
              <button onClick={collapseAll} className="flex-1 text-[9px] font-bold px-2 py-1 rounded bg-gray-800 text-gray-500 hover:text-white hover:bg-gray-700 border border-gray-700 transition-colors">CLOSE ALL</button>
            </div>

            {activeTab === 'nodes' && jobs.map(job => {
                const isOpen = openNodeGroups[job.name];
                return (
                  <div key={job.name} className="rounded-lg overflow-hidden border border-gray-800/50 bg-gray-800/30 mb-2">
                    <div className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors ${isOpen ? 'bg-gray-800 text-gray-200' : 'hover:bg-gray-800 text-gray-400'}`} onClick={() => toggleNodeGroup(job.name)}>
                      <span className={`text-[10px] font-bold uppercase tracking-tight ${isOpen ? job.headerColor : ''}`}>{job.name}</span>
                      <svg className={`w-3 h-3 text-gray-500 transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </div>
                    {isOpen && (
                      <div className="px-2 pb-2 pt-1 space-y-1.5 bg-gray-900/50 animate-in fade-in slide-in-from-top-1 duration-200">
                        {job.algorithms.map(alg => (
                          <div 
                            key={alg.type} 
                            draggable 
                            onDragStart={(e) => onDragStart(e, alg.type)} 
                            className={`${alg.color} group p-2 rounded border border-white/5 cursor-grab active:cursor-grabbing hover:translate-x-1 transition-all shadow-sm`}
                          >
                            <span className="text-[10px] font-bold text-white w-full text-center block uppercase tracking-wider">{alg.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

            {activeTab === 'templates' && templateJobs.map(job => {
                  const isOpen = openTemplateGroups[job.name];
                  return (
                    <div key={job.name} className="rounded-lg overflow-hidden border border-gray-800/50 bg-gray-800/30 mb-2">
                      <div className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors ${isOpen ? 'bg-gray-800 text-gray-200' : 'hover:bg-gray-800 text-gray-400'}`} onClick={() => toggleTemplateGroup(job.name)}>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${isOpen ? job.headerColor : ''}`}>{job.name}</span>
                        </div>
                        <svg className={`w-3 h-3 text-gray-500 transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </div>
                      {isOpen && (
                        <div className="px-2 pb-2 pt-1 space-y-2 bg-gray-900/50 animate-in fade-in slide-in-from-top-1 duration-200">
                          {job.templates.map((t, idx) => {
                            const style = getTemplateStyles(t.color ?? 'teal');
                            return (
                              <div key={idx} onClick={() => onLoadTemplate?.(t)} onContextMenu={(e) => openContextMenu(e, t)} className={`group p-2 rounded-lg border border-gray-700 bg-gray-800/50 hover:bg-gray-800 ${style.border} cursor-pointer transition relative overflow-hidden shadow-md`}>
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.stripe} opacity-0 group-hover:opacity-100 transition`} />
                                <h3 className={`text-[10px] font-black uppercase ${style.text} ${style.hoverText} mb-0.5`}>{t.name}</h3>
                                <p className="text-[9px] text-gray-500 leading-tight line-clamp-2">{t.description}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        ) : <div className="flex-1" />}

        {!collapsed && <div className="p-3 text-[9px] text-center text-gray-600 border-t border-gray-800 font-mono tracking-widest uppercase">VIPER Framework</div>}
      </aside>

      {contextMenu.visible && (
        <div className="fixed z-[9999] bg-gray-800 border border-gray-700 text-[11px] font-bold uppercase rounded-md shadow-2xl py-1 w-48 overflow-hidden" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button className="w-full text-left px-3 py-2 hover:bg-teal-600 text-white transition-colors flex items-center gap-2" onClick={() => { onLoadTemplate?.(contextMenu.template!); setContextMenu((c) => ({ ...c, visible: false })); }}>
             <span className="text-xs">▶</span> Load Template
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-indigo-600 text-white transition-colors flex items-center gap-2" onClick={() => { setAboutModal({ visible: true, template: contextMenu.template }); setContextMenu((c) => ({ ...c, visible: false })); }}>
             <span className="text-xs">🧩</span> About Algorithm
          </button>
        </div>
      )}

      {aboutModal.visible && (
        <AlgorithmInfoModal template={aboutModal.template} onClose={() => setAboutModal({ visible: false, template: null })} />
      )}
    </>
  );
};

export default Sidebar;
