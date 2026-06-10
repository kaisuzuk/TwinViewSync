/**
 * background.ts – Service Worker for TwinView Sync
 *
 * Responsibilities:
 *  - Relay messages between the two paired tabs
 *  - Handle tab capture for Compare Overlay
 *  - Persist sync state in chrome.storage.local
 */

import type {
  ExtensionMessage,
  SyncState,
  CaptureTabMessage,
  CompareOverlayMessage,
} from './shared/types';
import { loadStorage, saveStorage, sendToTab } from './shared/messaging';

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

async function sendToReadyTab(tabId: number, message: ExtensionMessage): Promise<void> {
  const ready = await ensureContentScript(tabId);
  if (!ready) return;
  await sendToTab(tabId, message);
}

// ─── Relay logic ─────────────────────────────────────────────────────────────

/**
 * Given the current state and the source tab ID, return the target tab ID(s)
 * that should receive the message.
 */
function resolveTargets(state: SyncState, sourceTabId: number): number[] {
  const { tabAId, tabBId } = state.pair;
  if (tabAId === null || tabBId === null) return [];
  if (tabAId === tabBId) return [];

  const isA = sourceTabId === tabAId;
  const isB = sourceTabId === tabBId;

  if (!isA && !isB) return [];

  const { direction } = state;

  if (direction === 'A_TO_B' && isA) return [tabBId];
  if (direction === 'B_TO_A' && isB) return [tabAId];
  if (direction === 'BIDIRECTIONAL') {
    return isA ? [tabBId] : [tabAId];
  }
  return [];
}

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    const sourceTabId = sender.tab?.id;

    // Handle capture request from popup
    if (message.type === 'CAPTURE_TAB') {
      handleCapture(message as CaptureTabMessage, sendResponse);
      return true; // async response
    }

    // All other relay messages need a source tab
    if (sourceTabId === undefined) return false;

    (async () => {
      const storage = await loadStorage();
      const { syncState } = storage;

      if (!syncState.enabled) return;

      const targets = resolveTargets(syncState, sourceTabId);
      await Promise.all(
        targets.map((tabId) =>
          sendToReadyTab(tabId, { ...message, sourceTabId })
        )
      );
    })();

    return false;
  }
);

// ─── Capture handler ─────────────────────────────────────────────────────────

async function handleCapture(
  message: CaptureTabMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const storage = await loadStorage();
    const { syncState } = storage;
    const { tabAId, tabBId } = syncState.pair;

    if (tabAId === null || tabBId === null) {
      sendResponse({ error: 'Tabs not paired' });
      return;
    }

    // Determine which tab to capture (source) and which to overlay on (target)
    const sourceTabId =
      message.overlayDirection === 'A_TO_B' ? tabAId : tabBId;
    const targetTabId =
      message.overlayDirection === 'A_TO_B' ? tabBId : tabAId;

    // Capture the source tab. captureVisibleTab captures the visible tab in a
    // window, so activate the requested source tab before taking the screenshot.
    const captureOptions: chrome.tabs.CaptureVisibleTabOptions = { format: 'png' };
    const sourceTab = await chrome.tabs.get(sourceTabId);
    const [previousActiveTab] = await chrome.tabs.query({
      active: true,
      windowId: sourceTab.windowId,
    });
    const previousActiveTabId = previousActiveTab?.id;
    let imageDataUrl: string;

    try {
      await chrome.tabs.update(sourceTabId, { active: true });
      imageDataUrl = await chrome.tabs.captureVisibleTab(sourceTab.windowId, captureOptions);
    } finally {
      if (previousActiveTabId !== undefined && previousActiveTabId !== sourceTabId) {
        await chrome.tabs.update(previousActiveTabId, { active: true }).catch(() => {/* ignore */});
      }
    }

    // Update storage
    storage.compareOverlay = {
      ...storage.compareOverlay,
      imageDataUrl,
      visible: true,
      direction: message.overlayDirection,
      opacity: message.opacity,
    };
    await saveStorage(storage);

    // Send image to target tab
    const overlayMsg: CompareOverlayMessage = {
      type: 'SET_COMPARE_IMAGE',
      imageDataUrl,
      opacity: message.opacity,
    };
    await sendToReadyTab(targetTabId, overlayMsg);

    sendResponse({ success: true, imageDataUrl });
  } catch (err) {
    sendResponse({ error: String(err) });
  }
}

// ─── Tab removal cleanup ──────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const storage = await loadStorage();
  const { pair } = storage.syncState;

  if (pair.tabAId === tabId) {
    storage.syncState.pair.tabAId = null;
    storage.syncState.pair.tabAUrl = '';
    storage.syncState.pair.tabATitle = '';
    storage.syncState.enabled = false;
    await saveStorage(storage);
  } else if (pair.tabBId === tabId) {
    storage.syncState.pair.tabBId = null;
    storage.syncState.pair.tabBUrl = '';
    storage.syncState.pair.tabBTitle = '';
    storage.syncState.enabled = false;
    await saveStorage(storage);
  }
});
