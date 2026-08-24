import { useCallback, useEffect, useState } from 'react';

import {
  createPlatformTemplate,
  listMyTemplates,
  listPublicTemplates,
  loadPlatformTemplate,
  updatePlatformTemplate,
  type CurrentWorkflow,
  type TemplateDetail,
  type TemplateSummary,
  type TemplateVisibility,
} from '../lib/templateApi';


type Props = {
  open: boolean;
  onClose: () => void;
  getCurrentWorkflow: () => CurrentWorkflow | null;
  onLoad: (template: TemplateDetail) => void;
};

type SaveDraft = {
  name: string;
  description: string;
  visibility: TemplateVisibility;
};

const emptyDraft: SaveDraft = {
  name: '',
  description: '',
  visibility: 'private',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function TemplatePlatformPanel({
  open,
  onClose,
  getCurrentWorkflow,
  onLoad,
}: Props) {
  const [activeTab, setActiveTab] = useState<'board' | 'mine'>('board');
  const [publicTemplates, setPublicTemplates] = useState<TemplateSummary[]>([]);
  const [myTemplates, setMyTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [draft, setDraft] = useState<SaveDraft>(emptyDraft);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [board, mine] = await Promise.all([
        listPublicTemplates(),
        listMyTemplates(),
      ]);
      setPublicTemplates(board);
      setMyTemplates(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const beginSave = () => {
    const current = getCurrentWorkflow();
    if (!current || current.workflow.nodes.length === 0) {
      setError('Add at least one node before saving a template.');
      return;
    }
    setError('');
    setDraft({ ...emptyDraft, name: current.name });
    setSaveOpen(true);
  };

  const saveCurrent = async () => {
    const current = getCurrentWorkflow();
    if (!current || current.workflow.nodes.length === 0) {
      setError('The current canvas is empty.');
      return;
    }
    if (!draft.name.trim()) {
      setError('Template name is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await createPlatformTemplate({
        name: draft.name.trim(),
        description: draft.description.trim(),
        visibility: draft.visibility,
        workflow: current.workflow,
      });
      setSaveOpen(false);
      setDraft(emptyDraft);
      setActiveTab('mine');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template');
    } finally {
      setLoading(false);
    }
  };

  const loadSelected = async (templateId: number) => {
    setBusyId(templateId);
    setError('');
    try {
      const template = await loadPlatformTemplate(templateId);
      onLoad(template);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load template');
    } finally {
      setBusyId(null);
    }
  };

  const changeVisibility = async (templateId: number, visibility: TemplateVisibility) => {
    setBusyId(templateId);
    setError('');
    try {
      await updatePlatformTemplate(templateId, { visibility });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update visibility');
    } finally {
      setBusyId(null);
    }
  };

  const updateFromCanvas = async (templateId: number) => {
    const current = getCurrentWorkflow();
    if (!current || current.workflow.nodes.length === 0) {
      setError('The current canvas is empty.');
      return;
    }

    setBusyId(templateId);
    setError('');
    try {
      await updatePlatformTemplate(templateId, { workflow: current.workflow });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update template');
    } finally {
      setBusyId(null);
    }
  };

  const items = activeTab === 'board' ? publicTemplates : myTemplates;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="template-platform-title">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="template-platform-title" className="text-lg font-black text-teal-300">VIPER Template Board</h2>
            <p className="text-xs text-slate-400">Publish reusable workflows or load a public workflow into a new tab.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close template board">✕</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-5 py-3">
          <button type="button" onClick={() => setActiveTab('board')} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === 'board' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:bg-slate-800'}`}>PUBLIC BOARD</button>
          <button type="button" onClick={() => setActiveTab('mine')} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === 'mine' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:bg-slate-800'}`}>MY TEMPLATES</button>
          <button type="button" onClick={beginSave} className="ml-auto rounded-lg bg-teal-600 px-4 py-2 text-xs font-black text-white hover:bg-teal-500">＋ SAVE CURRENT</button>
        </div>

        {saveOpen && (
          <div className="border-b border-slate-800 bg-slate-900/70 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_160px_auto]">
              <input value={draft.name} maxLength={160} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Template name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-500" />
              <input value={draft.description} maxLength={2000} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Short description" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-500" />
              <select value={draft.visibility} onChange={(event) => setDraft((value) => ({ ...value, visibility: event.target.value as TemplateVisibility }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
              <div className="flex gap-2">
                <button type="button" disabled={loading} onClick={() => void saveCurrent()} className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">SAVE</button>
                <button type="button" onClick={() => setSaveOpen(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">CANCEL</button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mx-5 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">{error}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && items.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading templates…</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center text-sm text-slate-500">
              {activeTab === 'board' ? 'No public templates yet.' : 'You have not saved a template yet.'}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((template) => {
                const busy = busyId === template.id;
                return (
                  <article key={template.id} className="flex min-h-52 flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 hover:border-teal-500/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-100">{template.name}</h3>
                        <p className="mt-1 text-[10px] text-slate-500">by {template.owner.display_name}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${template.visibility === 'public' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>{template.visibility}</span>
                    </div>
                    <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">{template.description || 'No description provided.'}</p>
                    <p className="mb-3 text-[9px] text-slate-600">Updated {formatDate(template.updated_at)}</p>

                    {activeTab === 'mine' && (
                      <div className="mb-2 flex gap-2">
                        <select disabled={busy} value={template.visibility} onChange={(event) => void changeVisibility(template.id, event.target.value as TemplateVisibility)} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300 disabled:opacity-50">
                          <option value="private">Private</option>
                          <option value="public">Public</option>
                        </select>
                        <button type="button" disabled={busy} onClick={() => void updateFromCanvas(template.id)} className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1.5 text-[9px] font-bold text-indigo-300 disabled:opacity-50">UPDATE FROM CANVAS</button>
                      </div>
                    )}

                    <button type="button" disabled={busy} onClick={() => void loadSelected(template.id)} className="w-full rounded-lg bg-teal-600/20 px-3 py-2 text-xs font-black text-teal-300 hover:bg-teal-600/30 disabled:opacity-50">
                      {busy ? 'WORKING…' : 'LOAD AS NEW TAB'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
