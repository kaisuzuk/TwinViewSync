import type { ExtensionMessage } from './types';
import type { ExtensionStorage } from './types';
import { DEFAULT_STORAGE, STORAGE_KEY } from './constants';

/**
 * Send a message to a specific tab's content script.
 */
export async function sendToTab(tabId: number, message: ExtensionMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_err) {
    // Tab may not have the content script injected yet; ignore silently.
  }
}

/**
 * Send a message to the background service worker.
 */
export async function sendToBackground(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Load the full extension storage with defaults applied.
 */
export async function loadStorage(): Promise<ExtensionStorage> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const stored = (raw[STORAGE_KEY] ?? {}) as Partial<ExtensionStorage>;
  return {
    syncState: { ...DEFAULT_STORAGE.syncState, ...stored.syncState },
    grid: { ...DEFAULT_STORAGE.grid, ...stored.grid },
    compareOverlay: { ...DEFAULT_STORAGE.compareOverlay, ...stored.compareOverlay },
    blink: { ...DEFAULT_STORAGE.blink, ...stored.blink },
  };
}

/**
 * Persist the full extension storage.
 */
export async function saveStorage(data: ExtensionStorage): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

/**
 * Update a partial section of the storage.
 */
export async function updateStorage(partial: Partial<ExtensionStorage>): Promise<ExtensionStorage> {
  const current = await loadStorage();
  const updated: ExtensionStorage = { ...current, ...partial };
  await saveStorage(updated);
  return updated;
}
