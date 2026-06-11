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
  CaptureDiffMessage,
  CompareOverlayMessage,
  DiffHighlightMessage,
  ClearVisualOverlaysMessage,
} from './shared/types';
import { appendDebugLog, loadStorage, saveStorage } from './shared/messaging';

const DIAGNOSTIC_MESSAGE_TYPES = new Set<string>([
  'MOUSE_DOWN',
  'MOUSE_UP',
  'MOUSE_CLICK',
  'WINDOW_SCROLL',
  'LOCATION_CHANGE',
  'KEY_DOWN',
  'KEY_UP',
  'INPUT',
  'CHANGE',
  'DRAG_START',
  'DRAG_END',
  'SYNC_STATE_CHANGED',
]);

function shouldLogMessage(message: ExtensionMessage): boolean {
  return DIAGNOSTIC_MESSAGE_TYPES.has(message.type);
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

async function sendToReadyTab(tabId: number, message: ExtensionMessage): Promise<'sent' | 'sent-after-inject' | 'failed'> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return 'sent';
  } catch {
    // The target tab may have been open before this extension build was loaded.
  }

  const ready = await ensureContentScript(tabId);
  if (!ready) return 'failed';

  try {
    await chrome.tabs.sendMessage(tabId, message);
    return 'sent-after-inject';
  } catch {
    return 'failed';
  }
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

function resolvePairTabs(state: SyncState): number[] {
  const { tabAId, tabBId } = state.pair;
  return [tabAId, tabBId].filter((tabId): tabId is number => tabId !== null);
}

function isPairedTab(state: SyncState, tabId: number): boolean {
  return state.pair.tabAId === tabId || state.pair.tabBId === tabId;
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
    if (message.type === 'CAPTURE_DIFF') {
      handleDiffCapture(message as CaptureDiffMessage, sendResponse);
      return true;
    }

    // All other relay messages need a source tab
    if (sourceTabId === undefined) return false;

    (async () => {
      try {
        const storage = await loadStorage();
        const { syncState } = storage;

        if (message.type === 'CLEAR_VISUAL_OVERLAYS') {
          const cleared = await clearVisualOverlaysForPairedTab(
            sourceTabId,
            message as ClearVisualOverlaysMessage
          );
          sendResponse({ success: cleared });
          return;
        }

        if (!syncState.enabled) {
          if (shouldLogMessage(message)) {
            await appendDebugLog({
              phase: 'relay',
              messageType: message.type,
              sourceTabId,
              detail: 'skipped: sync disabled',
            });
          }
          sendResponse({ skipped: true });
          return;
        }

        const targets = resolveTargets(syncState, sourceTabId);
        const relayedMessage = { ...message, sourceTabId } as ExtensionMessage;
        const results = await Promise.all(
          targets.map(async (tabId) => ({
            tabId,
            result: await sendToReadyTab(tabId, relayedMessage),
          }))
        );
        if (shouldLogMessage(message)) {
          await appendDebugLog({
            phase: 'relay',
            messageType: message.type,
            sourceTabId,
            targetTabId: results[0]?.tabId,
            detail: targets.length === 0
              ? 'no target resolved'
              : results.map(({ tabId, result }) => `${tabId}:${result}`).join(', '),
          });
        }
        sendResponse({ success: true });
      } catch (err) {
        if (shouldLogMessage(message)) {
          await appendDebugLog({
            phase: 'error',
            messageType: message.type,
            sourceTabId,
            detail: String(err),
          });
        }
        sendResponse({ error: String(err) });
      }
    })();

    return true;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function captureTabViewport(tabId: number): Promise<string> {
  const captureOptions: chrome.tabs.CaptureVisibleTabOptions = { format: 'png' };
  const tab = await chrome.tabs.get(tabId);
  const [previousActiveTab] = await chrome.tabs.query({
    active: true,
    windowId: tab.windowId,
  });
  const previousActiveTabId = previousActiveTab?.id;

  try {
    await chrome.tabs.update(tabId, { active: true });
    await delay(120);
    return await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
  } finally {
    if (previousActiveTabId !== undefined && previousActiveTabId !== tabId) {
      await chrome.tabs.update(previousActiveTabId, { active: true }).catch(() => {/* ignore */});
    }
  }
}

async function handleDiffCapture(
  message: CaptureDiffMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const storage = await loadStorage();
    const { tabAId, tabBId } = storage.syncState.pair;

    if (tabAId === null || tabBId === null) {
      sendResponse({ error: 'Tabs not paired' });
      return;
    }

    const sourceTabId = message.direction === 'A_TO_B' ? tabAId : tabBId;
    const targetTabId = message.direction === 'A_TO_B' ? tabBId : tabAId;

    const referenceImageDataUrl = await captureTabViewport(sourceTabId);
    await sendToReadyTab(targetTabId, { type: 'HIDE_COMPARE_OVERLAY' });
    await sendToReadyTab(targetTabId, { type: 'HIDE_DIFF_HIGHLIGHT' });
    await delay(80);
    const targetImageDataUrl = await captureTabViewport(targetTabId);

    storage.diffHighlight = {
      ...storage.diffHighlight,
      visible: true,
      direction: message.direction,
      opacity: message.opacity,
      threshold: message.threshold,
      referenceImageDataUrl,
      targetImageDataUrl,
    };
    await saveStorage(storage);

    if (
      storage.compareOverlay.visible &&
      storage.compareOverlay.imageDataUrl &&
      storage.compareOverlay.direction === message.direction
    ) {
      const overlayMsg: CompareOverlayMessage = {
        type: 'SHOW_COMPARE_OVERLAY',
        imageDataUrl: storage.compareOverlay.imageDataUrl,
        opacity: storage.compareOverlay.opacity,
      };
      await sendToReadyTab(targetTabId, overlayMsg);
    }

    const diffMsg: DiffHighlightMessage = {
      type: 'SET_DIFF_IMAGE',
      referenceImageDataUrl,
      targetImageDataUrl,
      opacity: message.opacity,
      threshold: message.threshold,
    };
    await sendToReadyTab(targetTabId, diffMsg);

    sendResponse({ success: true, referenceImageDataUrl, targetImageDataUrl });
  } catch (err) {
    sendResponse({ error: String(err) });
  }
}

async function clearVisualOverlaysForPairedTab(
  sourceTabId: number,
  message: ClearVisualOverlaysMessage
): Promise<boolean> {
  const storage = await loadStorage();
  if (!isPairedTab(storage.syncState, sourceTabId)) return false;

  storage.compareOverlay = {
    ...storage.compareOverlay,
    visible: false,
    imageDataUrl: null,
  };
  storage.blink = {
    ...storage.blink,
    enabled: false,
  };
  storage.diffHighlight = {
    ...storage.diffHighlight,
    visible: false,
    referenceImageDataUrl: null,
    targetImageDataUrl: null,
  };
  await saveStorage(storage);

  await Promise.all(
    resolvePairTabs(storage.syncState).map((tabId) => sendToReadyTab(tabId, message))
  );
  await appendDebugLog({
    phase: 'state',
    messageType: 'CLEAR_VISUAL_OVERLAYS',
    sourceTabId,
    detail: `cleared: ${message.reason}${message.href ? ` ${message.href}` : ''}`,
  });
  return true;
}

// ─── Tab removal cleanup ──────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;

  (async () => {
    const storage = await loadStorage();
    if (!isPairedTab(storage.syncState, tabId)) return;

    await clearVisualOverlaysForPairedTab(tabId, {
      type: 'CLEAR_VISUAL_OVERLAYS',
      reason: 'url-change',
      href: changeInfo.url,
    });
  })().catch(() => {/* ignore */});
});

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
