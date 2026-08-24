import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
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


export type PlatformTemplateView = 'public' | 'private';

type Props = {
  view: PlatformTemplateView;
  getCurrentWorkflow: () => CurrentWorkflow | null;
  onLoad: (template: TemplateDetail) => void;
  onViewChange: (view: PlatformTemplateView) => void;
};

type SaveDraft = {
  name: string;
  description: string;
  visibility: TemplateVisibility;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value));
}

export default function TemplatePlatformLibrary({
  view,
  getCurrentWorkflow,
  onLoad,
  onViewChange,
}: Props) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [draft, setDraft] = useState<SaveDraft>({
    name: '',
    description: '',
    visibility: view,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = view === 'public'
        ? await listPublicTemplates()
        : (await listMyTemplates()).filter((template) => template.visibility === 'private');
      setTemplates(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load templates');
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginSave = () => {
    const current = getCurrentWorkflow();
    if (!current || current.workflow.nodes.length === 0) {
      setError('Add at least one node before saving a template.');
      return;
    }
    setError('');
    setNotice('');
    setDraft({ name: current.name, description: '', visibility: view });
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
    setNotice('');
    try {
      await createPlatformTemplate({
        name: draft.name.trim(),
        description: draft.description.trim(),
        visibility: draft.visibility,
        workflow: current.workflow,
      });
      setSaveOpen(false);
      if (draft.visibility === view) {
        setNotice('Template saved.');
        await refresh();
      } else {
        onViewChange(draft.visibility);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template');
    } finally {
      setLoading(false);
    }
  };

  const loadSelected = async (templateId: number) => {
    setBusyId(templateId);
    setError('');
    setNotice('');
    try {
      onLoad(await loadPlatformTemplate(templateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load template');
    } finally {
      setBusyId(null);
    }
  };

  const changeVisibility = async (templateId: number, visibility: TemplateVisibility) => {
    setBusyId(templateId);
    setError('');
    setNotice('');
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
    setNotice('');
    try {
      await updatePlatformTemplate(templateId, { workflow: current.workflow });
      setNotice('Template updated from the current canvas.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update template');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={beginSave}
          className="flex-1 rounded-md bg-teal-600 px-2 py-2 text-[9px] font-black text-white transition-colors hover:bg-teal-500"
        >
          ＋ SAVE CURRENT
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh templates"
          aria-label="Refresh templates"
          className="rounded-md border border-gray-700 bg-gray-800 px-2.5 text-xs text-gray-400 hover:text-white disabled:opacity-50"
        >
          ↻
        </button>
      </div>

      {saveOpen && (
        <div className="space-y-2 rounded-lg border border-teal-500/30 bg-gray-800/60 p-2">
          <div className="text-[9px] font-black uppercase tracking-wider text-teal-300">Save current workflow</div>
          <input
            value={draft.name}
            maxLength={160}
            onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
            placeholder="Template name"
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] text-white outline-none focus:border-teal-500"
          />
          <textarea
            value={draft.description}
            maxLength={2000}
            rows={3}
            onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))}
            placeholder="Short description"
            className="w-full resize-none rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] text-white outline-none focus:border-teal-500"
          />
          <select
            value={draft.visibility}
            onChange={(event) => setDraft((value) => ({ ...value, visibility: event.target.value as TemplateVisibility }))}
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] text-gray-200"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <div className="flex gap-1.5">
            <button type="button" disabled={loading} onClick={() => void saveCurrent()} className="flex-1 rounded-md bg-teal-600 px-2 py-1.5 text-[9px] font-bold text-white disabled:opacity-50">SAVE</button>
            <button type="button" onClick={() => setSaveOpen(false)} className="flex-1 rounded-md border border-gray-700 px-2 py-1.5 text-[9px] font-bold text-gray-400">CANCEL</button>
          </div>
        </div>
      )}

      {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[9px] leading-relaxed text-red-300">{error}</div>}
      {notice && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[9px] leading-relaxed text-emerald-300">{notice}</div>}

      {loading && templates.length === 0 ? (
        <div className="py-10 text-center text-[10px] text-gray-500">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 px-3 py-10 text-center text-[10px] leading-relaxed text-gray-500">
          {view === 'public' ? 'No public templates yet.' : 'You have no private templates yet.'}
        </div>
      ) : (
        templates.map((template) => {
          const busy = busyId === template.id;
          const isOwner = user?.id === template.owner_id;
          return (
            <article key={template.id} className="rounded-lg border border-gray-800 bg-gray-800/40 p-2.5 transition-colors hover:border-teal-500/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[10px] font-black uppercase text-teal-300">{template.name}</h3>
                  <p className="mt-0.5 truncate text-[8px] text-gray-500">by {template.owner.display_name}</p>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${template.visibility === 'public' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-indigo-500/15 text-indigo-300'}`}>
                  {template.visibility}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-[9px] leading-relaxed text-gray-400">{template.description || 'No description provided.'}</p>
              <p className="mt-1.5 text-[8px] text-gray-600">Updated {formatDate(template.updated_at)}</p>

              {isOwner && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeVisibility(template.id, template.visibility === 'public' ? 'private' : 'public')}
                    className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-1.5 text-[8px] font-bold text-indigo-300 disabled:opacity-50"
                  >
                    MAKE {template.visibility === 'public' ? 'PRIVATE' : 'PUBLIC'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void updateFromCanvas(template.id)}
                    className="rounded border border-gray-700 bg-gray-800 px-1.5 py-1.5 text-[8px] font-bold text-gray-300 disabled:opacity-50"
                  >
                    UPDATE CANVAS
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void loadSelected(template.id)}
                className="mt-2 w-full rounded-md bg-teal-600/20 px-2 py-1.5 text-[9px] font-black text-teal-300 hover:bg-teal-600/30 disabled:opacity-50"
              >
                {busy ? 'WORKING…' : 'LOAD AS NEW TAB'}
              </button>
            </article>
          );
        })
      )}
    </div>
  );
}
