/**
 * popup.ts – TwinView Sync Popup UI
 *
 * Controls:
 *  - Tab pairing (Set Tab A / Set Tab B)
 *  - Sync Enable/Disable, Pause
 *  - Sync direction
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
  DiffHighlightSettings,
  SyncDirection,
  GridMessage,
  CompareOverlayMessage,
  BlinkMessage,
  DiffHighlightMessage,
  SyncStateChangedMessage,
  CaptureTabMessage,
  CaptureDiffMessage,
  DebugLogEntry,
} from '../shared/types';
import { appendDebugLog, clearDebugLogs, loadDebugLogs, loadStorage, saveStorage } from '../shared/messaging';

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
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return true;
  } catch {
    // No current content-script receiver; inject below.
  }

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
    warning.style.display = 'block';
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

function renderDiffHighlight(diff: DiffHighlightSettings): void {
  const btn = $('diff-toggle');
  const opacityRange = $<HTMLInputElement>('diff-opacity');
  const opacityLabel = $('diff-opacity-val');
  const thresholdRange = $<HTMLInputElement>('diff-threshold');
  const thresholdLabel = $('diff-threshold-val');
  const dirSelect = $<HTMLSelectElement>('diff-direction');

  opacityRange.value = String(diff.opacity);
  opacityLabel.textContent = `${Math.round(diff.opacity * 100)}%`;
  thresholdRange.value = String(diff.threshold);
  thresholdLabel.textContent = String(diff.threshold);
  dirSelect.value = diff.direction;

  if (diff.visible) {
    btn.textContent = 'Hide Diff';
    btn.classList.add('is-active');
  } else {
    btn.textContent = 'Show Diff';
    btn.classList.remove('is-active');
  }
}

function renderAll(): void {
  renderSyncState(storage.syncState);
  renderTabPair(storage.syncState);
  renderGrid(storage.grid);
  renderCompareOverlay(storage.compareOverlay);
  renderBlink(storage.blink);
  renderDiffHighlight(storage.diffHighlight);
}

function formatLogEntry(entry: DebugLogEntry): string {
  const time = new Date(entry.ts).toLocaleTimeString();
  const source = entry.sourceTabId !== undefined ? ` src=${entry.sourceTabId}` : '';
  const target = entry.targetTabId !== undefined ? ` dst=${entry.targetTabId}` : '';
  return `${time} [${entry.phase}] ${entry.messageType}${source}${target} ${entry.detail}`;
}

async function renderDiagnostics(): Promise<void> {
  const logs = await loadDebugLogs();
  const latest = logs.slice(-80).reverse();
  $('diag-log').textContent = latest.length > 0
    ? latest.map(formatLogEntry).join('\n')
    : 'No logs';
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
  await renderDiagnostics();

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
        imageDataUrl: storage.compareOverlay.imageDataUrl ?? undefined,
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
      if (!storage.compareOverlay.imageDataUrl) {
        alert('Please capture a reference before showing the overlay.');
        storage.compareOverlay.visible = false;
        await saveStorage(storage);
        renderCompareOverlay(storage.compareOverlay);
        return;
      }

      const msg: CompareOverlayMessage = {
        type: 'SHOW_COMPARE_OVERLAY',
        opacity: storage.compareOverlay.opacity,
        imageDataUrl: storage.compareOverlay.imageDataUrl,
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

  // ── Diff highlight direction ─────────────────────────────────────────────
  $<HTMLSelectElement>('diff-direction').addEventListener('change', async (e) => {
    storage.diffHighlight.direction = (e.target as HTMLSelectElement).value as 'A_TO_B' | 'B_TO_A';
    await saveStorage(storage);
  });

  // ── Diff highlight opacity ───────────────────────────────────────────────
  $<HTMLInputElement>('diff-opacity').addEventListener('input', async (e) => {
    storage.diffHighlight.opacity = parseFloat((e.target as HTMLInputElement).value);
    $('diff-opacity-val').textContent = `${Math.round(storage.diffHighlight.opacity * 100)}%`;
    await applyDiffHighlightUpdate();
  });

  // ── Diff highlight threshold ─────────────────────────────────────────────
  $<HTMLInputElement>('diff-threshold').addEventListener('input', async (e) => {
    storage.diffHighlight.threshold = parseInt((e.target as HTMLInputElement).value, 10) || 0;
    $('diff-threshold-val').textContent = String(storage.diffHighlight.threshold);
    await applyDiffHighlightUpdate();
  });

  // ── Capture diff ─────────────────────────────────────────────────────────
  $('diff-capture-btn').addEventListener('click', async () => {
    const { tabAId, tabBId } = storage.syncState.pair;
    if (!tabAId || !tabBId) {
      alert('Please set both Tab A and Tab B first.');
      return;
    }

    const captureMsg: CaptureDiffMessage = {
      type: 'CAPTURE_DIFF',
      direction: storage.diffHighlight.direction,
      opacity: storage.diffHighlight.opacity,
      threshold: storage.diffHighlight.threshold,
    };
    const result = await chrome.runtime.sendMessage(captureMsg) as {
      success?: boolean;
      error?: string;
      referenceImageDataUrl?: string;
      targetImageDataUrl?: string;
    };

    if (result?.success) {
      storage.diffHighlight.referenceImageDataUrl = result.referenceImageDataUrl ?? null;
      storage.diffHighlight.targetImageDataUrl = result.targetImageDataUrl ?? null;
      storage.diffHighlight.visible = true;
      await saveStorage(storage);
      renderDiffHighlight(storage.diffHighlight);
    } else {
      alert(`Diff capture failed: ${result?.error ?? 'Unknown error'}`);
    }
  });

  // ── Diff highlight toggle ────────────────────────────────────────────────
  $('diff-toggle').addEventListener('click', async () => {
    storage.diffHighlight.visible = !storage.diffHighlight.visible;
    await saveStorage(storage);
    renderDiffHighlight(storage.diffHighlight);

    const targetTabId = getDiffTargetTabId();
    if (storage.diffHighlight.visible) {
      if (!storage.diffHighlight.referenceImageDataUrl || !storage.diffHighlight.targetImageDataUrl) {
        alert('Please capture a diff before showing the highlight.');
        storage.diffHighlight.visible = false;
        await saveStorage(storage);
        renderDiffHighlight(storage.diffHighlight);
        return;
      }

      const msg: DiffHighlightMessage = {
        type: 'SHOW_DIFF_HIGHLIGHT',
        referenceImageDataUrl: storage.diffHighlight.referenceImageDataUrl,
        targetImageDataUrl: storage.diffHighlight.targetImageDataUrl,
        opacity: storage.diffHighlight.opacity,
        threshold: storage.diffHighlight.threshold,
      };
      await broadcastToTab(targetTabId, msg);
    } else {
      const msg: DiffHighlightMessage = {
        type: 'HIDE_DIFF_HIGHLIGHT',
      };
      await broadcastToTab(targetTabId, msg);
    }
  });

  // ── Diagnostics ───────────────────────────────────────────────────────────
  $('diag-probe').addEventListener('click', async () => {
    const { tabAId, tabBId } = storage.syncState.pair;
    const results = await Promise.all([
      tabAId === null ? Promise.resolve('A:not-set') : ensureContentScript(tabAId).then((ok) => `A:${tabAId}:${ok ? 'ready' : 'failed'}`),
      tabBId === null ? Promise.resolve('B:not-set') : ensureContentScript(tabBId).then((ok) => `B:${tabBId}:${ok ? 'ready' : 'failed'}`),
    ]);
    await appendDebugLog({
      phase: 'state',
      messageType: 'SYSTEM',
      detail: `probe ${results.join(' ')}`,
    });
    await renderDiagnostics();
  });

  $('diag-refresh').addEventListener('click', async () => {
    await renderDiagnostics();
  });

  $('diag-clear').addEventListener('click', async () => {
    await clearDebugLogs();
    await renderDiagnostics();
  });

  $('diag-copy').addEventListener('click', async () => {
    const logs = await loadDebugLogs();
    const text = logs.map(formatLogEntry).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      $('diag-copy').textContent = 'Copied';
      setTimeout(() => {
        $('diag-copy').textContent = 'Copy';
      }, 900);
    } catch {
      $('diag-log').textContent = text || 'No logs';
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

function getDiffTargetTabId(): number | null {
  return storage.diffHighlight.direction === 'A_TO_B'
    ? storage.syncState.pair.tabBId
    : storage.syncState.pair.tabAId;
}

async function applyDiffHighlightUpdate(): Promise<void> {
  await saveStorage(storage);
  if (
    !storage.diffHighlight.visible ||
    !storage.diffHighlight.referenceImageDataUrl ||
    !storage.diffHighlight.targetImageDataUrl
  ) {
    return;
  }

  const msg: DiffHighlightMessage = {
    type: 'SHOW_DIFF_HIGHLIGHT',
    referenceImageDataUrl: storage.diffHighlight.referenceImageDataUrl,
    targetImageDataUrl: storage.diffHighlight.targetImageDataUrl,
    opacity: storage.diffHighlight.opacity,
    threshold: storage.diffHighlight.threshold,
  };
  await broadcastToTab(getDiffTargetTabId(), msg);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

init().catch(console.error);
