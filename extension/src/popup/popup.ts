/**
 * popup.ts – TwinView Sync Popup UI
 *
 * Controls:
 *  - Tab pairing (Set Tab A / Set Tab B)
 *  - Sync Enable/Disable, Pause
 *  - Sync direction / mode
 *  - Grid overlay
 *  - Compare Overlay (capture + show/hide)
 *  - Blink Compare
 */

import type {
  ExtensionStorage,
  SyncState,
  GridSettings,
  CompareOverlaySettings,
  BlinkSettings,
  SyncDirection,
  SyncMode,
  GridMessage,
  CompareOverlayMessage,
  BlinkMessage,
  SyncStateChangedMessage,
  CaptureTabMessage,
} from '../shared/types';
import { loadStorage, saveStorage } from '../shared/messaging';

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

// ─── State ────────────────────────────────────────────────────────────────────

let storage: ExtensionStorage;
let paused = false;

// ─── Broadcast helpers ───────────────────────────────────────────────────────

async function broadcastToTab(tabId: number | null, message: object): Promise<void> {
  if (tabId === null) return;
  const ready = await ensureContentScript(tabId);
  if (!ready) return;
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {/* tab not ready */}
}

async function broadcastToBothTabs(message: object): Promise<void> {
  const { tabAId, tabBId } = storage.syncState.pair;
  await Promise.all([
    broadcastToTab(tabAId, message),
    broadcastToTab(tabBId, message),
  ]);
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content.js'],
    });
    return true;
  } catch {
    return false;
  }
}

function isPairReady(state: SyncState): boolean {
  const { tabAId, tabBId } = state.pair;
  return tabAId !== null && tabBId !== null && tabAId !== tabBId;
}

// ─── UI rendering ────────────────────────────────────────────────────────────

function renderSyncState(state: SyncState): void {
  const badge = $('sync-badge');
  const toggleBtn = $<HTMLButtonElement>('sync-toggle');
  const pauseBtn = $('sync-pause');
  const warning = $('review-warning');

  if (!state.enabled) {
    badge.textContent = 'OFF';
    badge.className = 'badge badge--off';
    toggleBtn.textContent = 'Enable Sync';
    toggleBtn.classList.remove('is-active');
    pauseBtn.style.display = 'none';
    warning.style.display = 'none';
    paused = false;
  } else if (paused) {
    badge.textContent = 'PAUSED';
    badge.className = 'badge badge--paused';
    pauseBtn.textContent = '▶ Resume';
  } else {
    badge.textContent = 'ON';
    badge.className = 'badge badge--on';
    toggleBtn.textContent = 'Disable Sync';
    toggleBtn.classList.add('is-active');
    pauseBtn.style.display = 'block';
    pauseBtn.textContent = '⏸ Pause';
    if (state.mode === 'review') {
      warning.style.display = 'block';
    }
  }
}

function renderTabPair(state: SyncState): void {
  $('tab-a-title').textContent = state.pair.tabATitle || '—';
  $('tab-a-url').textContent = state.pair.tabAUrl || '—';
  $('tab-b-title').textContent = state.pair.tabBTitle || '—';
  $('tab-b-url').textContent = state.pair.tabBUrl || '—';
}

function renderGrid(grid: GridSettings): void {
  const btn = $('grid-toggle');
  const sizeSelect = $<HTMLSelectElement>('grid-size');
  const sizeCustom = $<HTMLInputElement>('grid-size-custom');
  const opacityRange = $<HTMLInputElement>('grid-opacity');
  const opacityLabel = $('grid-opacity-val');
  const offsetX = $<HTMLInputElement>('grid-offset-x');
  const offsetY = $<HTMLInputElement>('grid-offset-y');

  const presets = [8, 10, 12, 16];
  if (presets.includes(grid.size)) {
    sizeSelect.value = String(grid.size);
    sizeCustom.style.display = 'none';
  } else {
    sizeSelect.value = 'custom';
    sizeCustom.style.display = 'inline-block';
    sizeCustom.value = String(grid.size);
  }

  opacityRange.value = String(grid.opacity);
  opacityLabel.textContent = `${Math.round(grid.opacity * 100)}%`;
  offsetX.value = String(grid.offsetX);
  offsetY.value = String(grid.offsetY);

  if (grid.visible) {
    btn.textContent = 'Hide Grid';
    btn.classList.add('is-active');
  } else {
    btn.textContent = 'Show Grid';
    btn.classList.remove('is-active');
  }
}

function renderCompareOverlay(compare: CompareOverlaySettings): void {
  const btn = $('overlay-toggle');
  const opacityRange = $<HTMLInputElement>('overlay-opacity');
  const opacityLabel = $('overlay-opacity-val');
  const dirSelect = $<HTMLSelectElement>('overlay-direction');

  opacityRange.value = String(compare.opacity);
  opacityLabel.textContent = `${Math.round(compare.opacity * 100)}%`;
  dirSelect.value = compare.direction;

  if (compare.visible) {
    btn.textContent = 'Hide Overlay';
    btn.classList.add('is-active');
  } else {
    btn.textContent = 'Show Overlay';
    btn.classList.remove('is-active');
  }
}

function renderBlink(blink: BlinkSettings): void {
  const btn = $('blink-toggle');
  const interval = $<HTMLInputElement>('blink-interval');

  interval.value = String(blink.interval);

  if (blink.enabled) {
    btn.textContent = 'Stop Blink';
    btn.classList.add('is-active');
  } else {
    btn.textContent = 'Start Blink';
    btn.classList.remove('is-active');
  }
}

function renderAll(): void {
  renderSyncState(storage.syncState);
  renderTabPair(storage.syncState);
  renderGrid(storage.grid);
  renderCompareOverlay(storage.compareOverlay);
  renderBlink(storage.blink);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  storage = await loadStorage();
  if (
    storage.syncState.pair.tabAId !== null &&
    storage.syncState.pair.tabAId === storage.syncState.pair.tabBId
  ) {
    storage.syncState.enabled = false;
    storage.syncState.pair.tabBId = null;
    storage.syncState.pair.tabBUrl = '';
    storage.syncState.pair.tabBTitle = '';
    await saveStorage(storage);
  }
  renderAll();

  // ── Set Tab A ────────────────────────────────────────────────────────────
  $('set-tab-a').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (storage.syncState.pair.tabBId === tab.id) {
      alert('Tab A and Tab B must be different tabs.');
      return;
    }
    storage.syncState.pair.tabAId = tab.id;
    storage.syncState.pair.tabAUrl = tab.url ?? '';
    storage.syncState.pair.tabATitle = tab.title ?? '';
    await saveStorage(storage);
    renderTabPair(storage.syncState);
  });

  // ── Set Tab B ────────────────────────────────────────────────────────────
  $('set-tab-b').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (storage.syncState.pair.tabAId === tab.id) {
      alert('Tab A and Tab B must be different tabs.');
      return;
    }
    storage.syncState.pair.tabBId = tab.id;
    storage.syncState.pair.tabBUrl = tab.url ?? '';
    storage.syncState.pair.tabBTitle = tab.title ?? '';
    await saveStorage(storage);
    renderTabPair(storage.syncState);
  });

  // ── Sync mode ─────────────────────────────────────────────────────────────
  $<HTMLSelectElement>('sync-mode').addEventListener('change', async (e) => {
    storage.syncState.mode = (e.target as HTMLSelectElement).value as SyncMode;
    await saveStorage(storage);
    renderSyncState(storage.syncState);
  });

  // ── Sync direction ────────────────────────────────────────────────────────
  $<HTMLSelectElement>('sync-direction').addEventListener('change', async (e) => {
    storage.syncState.direction = (e.target as HTMLSelectElement).value as SyncDirection;
    await saveStorage(storage);
  });

  // ── Sync toggle ───────────────────────────────────────────────────────────
  $('sync-toggle').addEventListener('click', async () => {
    if (!storage.syncState.enabled && !isPairReady(storage.syncState)) {
      alert('Please set two different tabs before enabling sync.');
      return;
    }

    storage.syncState.enabled = !storage.syncState.enabled;
    paused = false;
    await saveStorage(storage);
    renderSyncState(storage.syncState);

    const msg: SyncStateChangedMessage = {
      type: 'SYNC_STATE_CHANGED',
      state: storage.syncState,
    };
    await broadcastToBothTabs(msg);
  });

  // ── Sync pause ────────────────────────────────────────────────────────────
  $('sync-pause').addEventListener('click', async () => {
    paused = !paused;

    if (paused) {
      // Temporarily disable sync in storage so content scripts stop sending
      const prevEnabled = storage.syncState.enabled;
      storage.syncState.enabled = false;
      await saveStorage(storage);
      const msg: SyncStateChangedMessage = {
        type: 'SYNC_STATE_CHANGED',
        state: storage.syncState,
      };
      await broadcastToBothTabs(msg);
      // Restore in-memory state so we can resume
      storage.syncState.enabled = prevEnabled;
    } else {
      // Resume: re-enable
      await saveStorage(storage);
      const msg: SyncStateChangedMessage = {
        type: 'SYNC_STATE_CHANGED',
        state: storage.syncState,
      };
      await broadcastToBothTabs(msg);
    }

    renderSyncState(storage.syncState);
  });

  // ── Grid size ─────────────────────────────────────────────────────────────
  $<HTMLSelectElement>('grid-size').addEventListener('change', async (e) => {
    const val = (e.target as HTMLSelectElement).value;
    const customInput = $<HTMLInputElement>('grid-size-custom');
    if (val === 'custom') {
      customInput.style.display = 'inline-block';
    } else {
      customInput.style.display = 'none';
      storage.grid.size = parseInt(val, 10);
      await applyGridUpdate();
    }
  });

  $<HTMLInputElement>('grid-size-custom').addEventListener('change', async (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (val > 0) {
      storage.grid.size = val;
      await applyGridUpdate();
    }
  });

  // ── Grid opacity ──────────────────────────────────────────────────────────
  $<HTMLInputElement>('grid-opacity').addEventListener('input', async (e) => {
    storage.grid.opacity = parseFloat((e.target as HTMLInputElement).value);
    $('grid-opacity-val').textContent = `${Math.round(storage.grid.opacity * 100)}%`;
    await applyGridUpdate();
  });

  // ── Grid offset X/Y ───────────────────────────────────────────────────────
  $<HTMLInputElement>('grid-offset-x').addEventListener('change', async (e) => {
    storage.grid.offsetX = parseInt((e.target as HTMLInputElement).value, 10) || 0;
    await applyGridUpdate();
  });

  $<HTMLInputElement>('grid-offset-y').addEventListener('change', async (e) => {
    storage.grid.offsetY = parseInt((e.target as HTMLInputElement).value, 10) || 0;
    await applyGridUpdate();
  });

  // ── Grid toggle ───────────────────────────────────────────────────────────
  $('grid-toggle').addEventListener('click', async () => {
    storage.grid.visible = !storage.grid.visible;
    await applyGridUpdate();
    renderGrid(storage.grid);
  });

  // ── Compare overlay direction ─────────────────────────────────────────────
  $<HTMLSelectElement>('overlay-direction').addEventListener('change', async (e) => {
    storage.compareOverlay.direction = (e.target as HTMLSelectElement).value as 'A_TO_B' | 'B_TO_A';
    await saveStorage(storage);
  });

  // ── Compare overlay opacity ───────────────────────────────────────────────
  $<HTMLInputElement>('overlay-opacity').addEventListener('input', async (e) => {
    storage.compareOverlay.opacity = parseFloat((e.target as HTMLInputElement).value);
    $('overlay-opacity-val').textContent = `${Math.round(storage.compareOverlay.opacity * 100)}%`;
    await saveStorage(storage);

    // Live-update the overlay opacity
    const targetTabId = storage.compareOverlay.direction === 'A_TO_B'
      ? storage.syncState.pair.tabBId
      : storage.syncState.pair.tabAId;

    if (targetTabId) {
      const msg: CompareOverlayMessage = {
        type: 'SHOW_COMPARE_OVERLAY',
        opacity: storage.compareOverlay.opacity,
      };
      await broadcastToTab(targetTabId, msg);
    }
  });

  // ── Capture reference ─────────────────────────────────────────────────────
  $('capture-btn').addEventListener('click', async () => {
    const { tabAId, tabBId } = storage.syncState.pair;
    if (!tabAId || !tabBId) {
      alert('Please set both Tab A and Tab B first.');
      return;
    }

    const captureMsg: CaptureTabMessage = {
      type: 'CAPTURE_TAB',
      targetTabId: storage.compareOverlay.direction === 'A_TO_B' ? tabBId : tabAId,
      overlayDirection: storage.compareOverlay.direction,
      opacity: storage.compareOverlay.opacity,
    };

    const result = await chrome.runtime.sendMessage(captureMsg) as { success?: boolean; error?: string; imageDataUrl?: string };

    if (result?.success) {
      storage.compareOverlay.imageDataUrl = result.imageDataUrl ?? null;
      storage.compareOverlay.visible = true;
      await saveStorage(storage);
      renderCompareOverlay(storage.compareOverlay);
    } else {
      alert(`Capture failed: ${result?.error ?? 'Unknown error'}`);
    }
  });

  // ── Overlay toggle ────────────────────────────────────────────────────────
  $('overlay-toggle').addEventListener('click', async () => {
    storage.compareOverlay.visible = !storage.compareOverlay.visible;
    await saveStorage(storage);
    renderCompareOverlay(storage.compareOverlay);

    const targetTabId = storage.compareOverlay.direction === 'A_TO_B'
      ? storage.syncState.pair.tabBId
      : storage.syncState.pair.tabAId;

    if (storage.compareOverlay.visible) {
      const msg: CompareOverlayMessage = {
        type: 'SHOW_COMPARE_OVERLAY',
        opacity: storage.compareOverlay.opacity,
      };
      await broadcastToTab(targetTabId, msg);
    } else {
      const msg: CompareOverlayMessage = {
        type: 'HIDE_COMPARE_OVERLAY',
      };
      await broadcastToTab(targetTabId, msg);
    }
  });

  // ── Blink interval ────────────────────────────────────────────────────────
  $<HTMLInputElement>('blink-interval').addEventListener('change', async (e) => {
    storage.blink.interval = parseInt((e.target as HTMLInputElement).value, 10) || 500;
    await saveStorage(storage);
  });

  // ── Blink toggle ──────────────────────────────────────────────────────────
  $('blink-toggle').addEventListener('click', async () => {
    storage.blink.enabled = !storage.blink.enabled;
    await saveStorage(storage);
    renderBlink(storage.blink);

    const targetTabId = storage.compareOverlay.direction === 'A_TO_B'
      ? storage.syncState.pair.tabBId
      : storage.syncState.pair.tabAId;

    if (storage.blink.enabled) {
      const msg: BlinkMessage = {
        type: 'START_BLINK',
        interval: storage.blink.interval,
        imageDataUrl: storage.compareOverlay.imageDataUrl ?? undefined,
      };
      await broadcastToTab(targetTabId, msg);
    } else {
      const msg: BlinkMessage = {
        type: 'STOP_BLINK',
      };
      await broadcastToTab(targetTabId, msg);
    }
  });
}

// ─── Grid apply helper ────────────────────────────────────────────────────────

async function applyGridUpdate(): Promise<void> {
  await saveStorage(storage);
  const msg: GridMessage = {
    type: 'UPDATE_GRID',
    settings: storage.grid,
  };
  await broadcastToBothTabs(msg);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

init().catch(console.error);
