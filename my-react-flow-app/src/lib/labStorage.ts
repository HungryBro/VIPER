// Lab tabs saved in this browser (LabPage). They are not per user, so logout removes them:
// on a shared lab computer the next person must not open the previous person's canvases.
export const STORAGE_KEY_APP_TABS = 'n2n_app_tabs';
export const STORAGE_KEY_ACTIVE_TAB = 'n2n_active_tab_id';

export function clearLabStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_APP_TABS);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_TAB);
  } catch {
    // storage blocked: nothing was saved there either
  }
}
