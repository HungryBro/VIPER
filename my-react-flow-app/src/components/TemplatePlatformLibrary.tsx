import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import {
  createPlatformTemplate,
  createTemplateComment,
  deleteTemplateComment,
  listMyTemplates,
  listOfficialTemplates,
  listPublicTemplates,
  listTemplateComments,
  loadPlatformTemplate,
  updateTemplateCommentsSetting,
  updatePlatformTemplate,
  uploadTemplateCover,
  type CurrentWorkflow,
  type TemplateComment,
  type TemplateDetail,
  type TemplateSummary,
  type TemplateVisibility,
} from '../lib/templateApi';
import { apiUrl } from '../lib/http';


export type PlatformTemplateView = 'official' | 'public' | 'private';

type Props = {
  view: PlatformTemplateView;
  getCurrentWorkflow: () => CurrentWorkflow | null;
  onLoad: (template: TemplateDetail) => void;
  onLoadOfficial: (officialKey: string) => void;
  onViewChange: (view: PlatformTemplateView) => void;
};

type SaveDraft = {
  name: string;
  description: string;
  visibility: TemplateVisibility;
};

type EditDraft = SaveDraft & {
  templateId: number;
  isOfficial: boolean;
  coverUrl: string | null;
  coverFile: File | null;
};

const MAX_COVER_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OFFICIAL_CATEGORY_ORDER = [
  'Feature Extraction',
  'Matching',
  'Object Alignment',
  'Classification',
  'Evaluation',
  'Quality Assessment',
  'Object Detection & XAI',
  'Other',
];

function officialTemplateCategory(template: TemplateSummary): string {
  switch (template.official_key ?? template.name) {
    case 'SIFT (Scale-Invariant Feature Transform)': return 'Feature Extraction';
    case 'FLANN (Fast Library for Approximate Nearest Neighbors)': return 'Matching';
    case 'Homography Estimation': return 'Object Alignment';
    case 'Otsu Thresholding':
    case 'Active Contour (Snake)': return 'Classification';
    case 'Shapes — End-to-End Training & Evaluation': return 'Evaluation';
    case 'PSNR (Peak Signal-to-Noise Ratio)':
    case 'BRISQUE (Blind/Referenceless Image Spatial Quality Evaluator)': return 'Quality Assessment';
    case 'Shapes — Detection & XAI': return 'Object Detection & XAI';
    default: return 'Other';
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value));
}

function formatCommentDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function TemplatePlatformLibrary({
  view,
  getCurrentWorkflow,
  onLoad,
  onLoadOfficial,
  onViewChange,
}: Props) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openSettingsId, setOpenSettingsId] = useState<number | null>(null);
  const [openCommentsId, setOpenCommentsId] = useState<number | null>(null);
  const [commentsLoadingId, setCommentsLoadingId] = useState<number | null>(null);
  const [commentBusyId, setCommentBusyId] = useState<number | null>(null);
  const [commentDeleteBusyId, setCommentDeleteBusyId] = useState<number | null>(null);
  const [commentsByTemplate, setCommentsByTemplate] = useState<Record<number, TemplateComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [draft, setDraft] = useState<SaveDraft>({
    name: '',
    description: '',
    visibility: view === 'private' ? 'private' : 'public',
  });
  const openCommentsIdRef = useRef<number | null>(null);

  useEffect(() => {
    openCommentsIdRef.current = openCommentsId;
  }, [openCommentsId]);

  const loadComments = useCallback(async (templateId: number) => {
    setCommentsLoadingId(templateId);
    setError('');
    try {
      const comments = await listTemplateComments(templateId);
      setCommentsByTemplate((current) => ({ ...current, [templateId]: comments }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load comments');
    } finally {
      setCommentsLoadingId(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = view === 'official'
        ? await listOfficialTemplates()
        : view === 'public'
          ? await listPublicTemplates()
          : (await listMyTemplates()).filter((template) => template.visibility === 'private');
      setTemplates(result);
      const openTemplateId = openCommentsIdRef.current;
      if (openTemplateId !== null && result.some((template) => template.id === openTemplateId)) {
        await loadComments(openTemplateId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load templates');
    } finally {
      setLoading(false);
    }
  }, [loadComments, view]);

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
    setDraft({ name: current.name, description: '', visibility: view === 'private' ? 'private' : 'public' });
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

  const loadSelected = async (template: TemplateSummary) => {
    setBusyId(template.id);
    setError('');
    setNotice('');
    try {
      const loaded = await loadPlatformTemplate(template.id);
      if (template.is_official) {
        if (!template.official_key) throw new Error('Official template is missing its workflow key.');
        onLoadOfficial(template.official_key);
      } else {
        onLoad(loaded);
      }
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

  const beginEdit = (template: TemplateSummary) => {
    setOpenSettingsId(null);
    setError('');
    setNotice('');
    setEditDraft({
      templateId: template.id,
      isOfficial: template.is_official,
      name: template.name,
      description: template.description,
      visibility: template.visibility,
      coverUrl: template.cover_url,
      coverFile: null,
    });
  };

  const selectCoverFile = (file: File | null) => {
    if (!file) return;
    if (!ACCEPTED_COVER_TYPES.has(file.type)) {
      setError('Cover image must be a JPEG, PNG, or WebP file.');
      return;
    }
    if (file.size > MAX_COVER_FILE_BYTES) {
      setError('Cover image must be 5 MB or smaller.');
      return;
    }
    setError('');
    setEditDraft((current) => (current ? { ...current, coverFile: file } : current));
  };

  const saveTemplateEdits = async () => {
    if (!editDraft) return;
    if (!editDraft.isOfficial && !editDraft.name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (editDraft.isOfficial && !editDraft.coverFile) {
      setError('Choose a cover image to update this Official template.');
      return;
    }

    setBusyId(editDraft.templateId);
    setError('');
    setNotice('');
    try {
      if (!editDraft.isOfficial) {
        await updatePlatformTemplate(editDraft.templateId, {
          name: editDraft.name.trim(),
          description: editDraft.description.trim(),
          visibility: editDraft.visibility,
        });
      }
      if (editDraft.coverFile) {
        await uploadTemplateCover(editDraft.templateId, editDraft.coverFile);
      }
      setEditDraft(null);
      setNotice(editDraft.isOfficial ? 'Official template cover updated.' : 'Template details updated.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update template details');
    } finally {
      setBusyId(null);
    }
  };

  const toggleCommentPanel = async (templateId: number) => {
    if (openCommentsId === templateId) {
      setOpenCommentsId(null);
      return;
    }
    setOpenCommentsId(templateId);
    if (commentsByTemplate[templateId] === undefined) {
      await loadComments(templateId);
    }
  };

  const submitComment = async (templateId: number) => {
    const body = (commentDrafts[templateId] ?? '').trim();
    if (!body) {
      setError('Comment cannot be blank.');
      return;
    }

    setCommentBusyId(templateId);
    setError('');
    setNotice('');
    try {
      const comment = await createTemplateComment(templateId, body);
      setCommentsByTemplate((current) => ({
        ...current,
        [templateId]: [...(current[templateId] ?? []), comment],
      }));
      setCommentDrafts((current) => ({ ...current, [templateId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post comment');
    } finally {
      setCommentBusyId(null);
    }
  };

  const deleteComment = async (templateId: number, commentId: number) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;

    setCommentDeleteBusyId(commentId);
    setError('');
    setNotice('');
    try {
      await deleteTemplateComment(templateId, commentId);
      setCommentsByTemplate((current) => ({
        ...current,
        [templateId]: (current[templateId] ?? []).filter((comment) => comment.id !== commentId),
      }));
      setNotice('Comment deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete comment');
    } finally {
      setCommentDeleteBusyId(null);
    }
  };

  const changeCommentsEnabled = async (templateId: number, enabled: boolean) => {
    setBusyId(templateId);
    setError('');
    setNotice('');
    try {
      const updated = await updateTemplateCommentsSetting(templateId, enabled);
      setTemplates((current) => current.map((template) => (
        template.id === updated.id ? updated : template
      )));
      setNotice(enabled
        ? 'Comments are open for this template.'
        : 'New comments are closed. Existing comments remain readable.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update comment setting');
    } finally {
      setBusyId(null);
    }
  };

  const displayTemplates = view === 'official'
    ? [...templates].sort((first, second) => {
      const categoryDifference = OFFICIAL_CATEGORY_ORDER.indexOf(officialTemplateCategory(first))
        - OFFICIAL_CATEGORY_ORDER.indexOf(officialTemplateCategory(second));
      return categoryDifference || first.name.localeCompare(second.name);
    })
    : templates;

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {view !== 'official' && (
          <button
            type="button"
            onClick={beginSave}
            className="min-h-10 flex-1 touch-manipulation rounded-md bg-teal-600 px-2 py-2 text-[10px] font-black text-white transition-colors hover:bg-teal-500 sm:text-[9px]"
          >
            ＋ SAVE CURRENT
          </button>
        )}
        {view !== 'official' && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            title="Refresh templates"
            aria-label="Refresh templates"
            className="min-h-10 min-w-10 touch-manipulation rounded-md border border-gray-700 bg-gray-800 px-2.5 text-xs text-gray-400 hover:text-white disabled:opacity-50"
          >
            ↻
          </button>
        )}
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

      {editDraft && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="template-edit-title">
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <h2 id="template-edit-title" className="text-lg font-black text-teal-300">{editDraft.isOfficial ? 'Official Template Cover' : 'Edit Template'}</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {editDraft.isOfficial
                    ? 'Upload or replace the cover image for this Official template.'
                    : 'Update the details and cover image for this template.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditDraft(null)}
                className="rounded-md px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close template editor"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
          {!editDraft.isOfficial && (
            <>
              <input
                value={editDraft.name}
                maxLength={160}
                onChange={(event) => setEditDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                placeholder="Template name"
                className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] text-white outline-none focus:border-indigo-400"
              />
              <textarea
                value={editDraft.description}
                maxLength={2000}
                rows={3}
                onChange={(event) => setEditDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                placeholder="Short description"
                className="w-full resize-none rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] text-white outline-none focus:border-indigo-400"
              />
              <select
                value={editDraft.visibility}
                onChange={(event) => setEditDraft((current) => (current ? { ...current, visibility: event.target.value as TemplateVisibility } : current))}
                className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] text-gray-200"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </>
          )}
          {editDraft.coverUrl && (
            <img
              src={apiUrl(editDraft.coverUrl)}
              alt="Current template cover"
              className="h-20 w-full rounded-md border border-gray-700 object-cover"
            />
          )}
          <label className="block rounded-md border border-dashed border-gray-600 bg-gray-950 px-2 py-1.5 text-[8px] font-bold text-gray-400 hover:border-indigo-400 hover:text-gray-200">
            <span>UPLOAD COVER · JPEG, PNG, WEBP · MAX 5 MB</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => selectCoverFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-[8px] text-gray-400 file:mr-2 file:rounded file:border-0 file:bg-indigo-500/20 file:px-2 file:py-1 file:text-[8px] file:font-bold file:text-indigo-200"
            />
          </label>
          {editDraft.coverFile && <div className="truncate text-[8px] text-indigo-200">New cover: {editDraft.coverFile.name}</div>}
          <div className="flex gap-1.5">
            <button type="button" disabled={busyId === editDraft.templateId} onClick={() => void saveTemplateEdits()} className="flex-1 rounded-md bg-indigo-600 px-2 py-1.5 text-[9px] font-bold text-white disabled:opacity-50">SAVE CHANGES</button>
            <button type="button" disabled={busyId === editDraft.templateId} onClick={() => setEditDraft(null)} className="flex-1 rounded-md border border-gray-700 px-2 py-1.5 text-[9px] font-bold text-gray-400 disabled:opacity-50">CANCEL</button>
          </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[9px] leading-relaxed text-red-300">{error}</div>}
      {notice && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[9px] leading-relaxed text-emerald-300">{notice}</div>}

      {loading && templates.length === 0 ? (
        <div className="py-10 text-center text-[10px] text-gray-500">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 px-3 py-10 text-center text-[10px] leading-relaxed text-gray-500">
          {view === 'official' ? 'No Official templates are available.' : view === 'public' ? 'No public templates yet.' : 'You have no private templates yet.'}
        </div>
      ) : (
        displayTemplates.map((template, index) => {
          const busy = busyId === template.id;
          const isOwner = user?.id === template.owner_id;
          const isAdmin = user?.role === 'admin';
          const canManageSettings = template.is_official ? isAdmin : isOwner || isAdmin;
          const commentsOpen = openCommentsId === template.id;
          const comments = commentsByTemplate[template.id];
          const commentsLoading = commentsLoadingId === template.id;
          const commentBusy = commentBusyId === template.id;
          const category = template.is_official ? officialTemplateCategory(template) : null;
          const previousCategory = index > 0 && displayTemplates[index - 1].is_official
            ? officialTemplateCategory(displayTemplates[index - 1])
            : null;
          return (
            <div key={template.id} className="space-y-1.5">
              {category !== null && category !== previousCategory && (
                <div className="px-1 pt-2 text-[9px] font-black uppercase tracking-wider text-teal-300">
                  {category}
                </div>
              )}
              <article className="rounded-lg border border-gray-800 bg-gray-800/40 p-2.5 transition-colors hover:border-teal-500/40">
              {template.cover_url && (
                <img
                  src={apiUrl(template.cover_url)}
                  alt={`${template.name} cover`}
                  className="mb-2 h-24 w-full rounded-md border border-gray-700 object-cover"
                />
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[10px] font-black uppercase text-teal-300">{template.name}</h3>
                  <p className="mt-0.5 truncate text-[8px] text-gray-500">by {template.owner.display_name}</p>
                </div>
                <div className="relative flex shrink-0 items-center gap-1">
                  {canManageSettings && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setOpenSettingsId((current) => (current === template.id ? null : template.id))}
                      title="Template settings"
                      aria-label="Template settings"
                      aria-expanded={openSettingsId === template.id}
                      className="flex h-9 w-9 touch-manipulation items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 disabled:opacity-50 sm:h-5 sm:w-5"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4 sm:h-3 sm:w-3"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.72 7.72 0 0 0-1.69-.98L14.5 2.42A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.25-1.18.59-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
                      </svg>
                    </button>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${template.is_official ? 'bg-amber-500/15 text-amber-300' : template.visibility === 'public' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-indigo-500/15 text-indigo-300'}`}>
                    {template.is_official ? 'official' : template.visibility}
                  </span>

                  {canManageSettings && openSettingsId === template.id && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-md border border-gray-700 bg-gray-900 p-1 shadow-xl">
                      {template.is_official && isAdmin && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => beginEdit(template)}
                          className="w-full rounded px-2 py-1.5 text-left text-[8px] font-bold text-teal-300 transition-colors hover:bg-teal-500/10 disabled:opacity-50"
                        >
                          EDIT COVER
                        </button>
                      )}
                      {isOwner && !template.is_official && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => beginEdit(template)}
                            className="w-full rounded px-2 py-1.5 text-left text-[8px] font-bold text-teal-300 transition-colors hover:bg-teal-500/10 disabled:opacity-50"
                          >
                            EDIT TEMPLATE
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setOpenSettingsId(null);
                              void changeVisibility(template.id, template.visibility === 'public' ? 'private' : 'public');
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-[8px] font-bold text-indigo-300 transition-colors hover:bg-indigo-500/10 disabled:opacity-50"
                          >
                            MAKE {template.visibility === 'public' ? 'PRIVATE' : 'PUBLIC'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setOpenSettingsId(null);
                              void updateFromCanvas(template.id);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-[8px] font-bold text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-50"
                          >
                            UPDATE CANVAS
                          </button>
                        </>
                      )}
                      {(template.is_official || isOwner) && isAdmin && <div className="my-1 border-t border-gray-700" />}
                      {isAdmin && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setOpenSettingsId(null);
                            void changeCommentsEnabled(template.id, !template.comments_enabled);
                          }}
                          className={`w-full rounded px-2 py-1.5 text-left text-[8px] font-bold transition-colors disabled:opacity-50 ${template.comments_enabled ? 'text-red-300 hover:bg-red-500/10' : 'text-emerald-300 hover:bg-emerald-500/10'}`}
                        >
                          {template.comments_enabled ? 'CLOSE COMMENTS' : 'OPEN COMMENTS'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-[9px] leading-relaxed text-gray-400">{template.description || 'No description provided.'}</p>
              <p className="mt-1.5 text-[8px] text-gray-600">Updated {formatDate(template.updated_at)}</p>

              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadSelected(template)}
                  className="min-h-10 touch-manipulation rounded-md bg-teal-600/20 px-2 py-1.5 text-[10px] font-black text-teal-300 hover:bg-teal-600/30 disabled:opacity-50 sm:min-h-0 sm:text-[8px]"
                >
                  {busy ? 'WORKING…' : 'LOAD NEW TAB'}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleCommentPanel(template.id)}
                  className={`min-h-10 touch-manipulation rounded-md border px-2 py-1.5 text-[10px] font-black sm:min-h-0 sm:text-[8px] ${commentsOpen ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200' : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-indigo-500/40'}`}
                >
                  COMMENTS{comments ? ` (${comments.length})` : ''}
                </button>
              </div>

              {commentsOpen && (
                <div className="mt-2 space-y-2 border-t border-gray-700/70 pt-2">
                  {commentsLoading ? (
                    <div className="py-3 text-center text-[9px] text-gray-500">Loading comments…</div>
                  ) : comments && comments.length > 0 ? (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5 custom-scrollbar">
                      {comments.map((comment) => (
                        <div key={comment.id} className="rounded-md bg-gray-950/70 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[8px] font-bold text-indigo-300">{comment.author.display_name}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="text-[7px] text-gray-600">{formatCommentDate(comment.created_at)}</span>
                              {user?.id === comment.author_id && (
                                <button
                                  type="button"
                                  disabled={commentDeleteBusyId === comment.id}
                                  onClick={() => void deleteComment(template.id, comment.id)}
                                  title="Delete your comment"
                                  aria-label="Delete your comment"
                                  className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 disabled:opacity-50"
                                >
                                  {commentDeleteBusyId === comment.id ? (
                                    <span aria-hidden="true" className="text-[9px]">…</span>
                                  ) : (
                                    <svg
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 6h18" />
                                      <path d="M8 6V4h8v2" />
                                      <path d="m19 6-1 14H6L5 6" />
                                      <path d="M10 10v6M14 10v6" />
                                    </svg>
                                  )}
                                </button>
                              )}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-[9px] leading-relaxed text-gray-300">{comment.body}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-2 text-center text-[9px] text-gray-600">No comments yet.</div>
                  )}

                  {!template.comments_enabled ? (
                    <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[8px] leading-relaxed text-amber-300">
                      Comments are closed. Existing comments remain readable.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <textarea
                        value={commentDrafts[template.id] ?? ''}
                        maxLength={2000}
                        rows={2}
                        onChange={(event) => setCommentDrafts((current) => ({
                          ...current,
                          [template.id]: event.target.value,
                        }))}
                        placeholder="Write a comment…"
                        className="w-full resize-none rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[9px] text-white outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={commentBusy}
                        onClick={() => void submitComment(template.id)}
                        className="w-full rounded-md bg-indigo-600/30 px-2 py-1.5 text-[8px] font-black text-indigo-200 hover:bg-indigo-600/40 disabled:opacity-50"
                      >
                        {commentBusy ? 'POSTING…' : 'POST COMMENT'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              </article>
            </div>
          );
        })
      )}
    </div>
  );
}
