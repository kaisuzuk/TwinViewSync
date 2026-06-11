import type { ExtensionMessage } from './types';
import type { ExtensionStorage } from './types';
import type { DebugLogEntry } from './types';
import { DEBUG_LOG_KEY, DEBUG_LOG_LIMIT, DEFAULT_STORAGE, STORAGE_KEY } from './constants';

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

function describeMessage(message: ExtensionMessage): string {
  const describeTarget = (target: { tagName: string; id: string; className?: string }): string => {
    const id = target.id ? `#${target.id}` : '';
    const className = target.className
      ? `.${target.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '';
    const text = 'text' in target && typeof target.text === 'string' && target.text
      ? ` text="${target.text}"`
      : '';
    return `${target.tagName}${id}${className}${text}`;
  };

  switch (message.type) {
    case 'MOUSE_DOWN':
    case 'MOUSE_UP':
    case 'MOUSE_CLICK':
      return `${message.target ? `target=${describeTarget(message.target)} ` : ''}x=${message.xRatio.toFixed(3)} y=${message.yRatio.toFixed(3)}`;
    case 'WINDOW_SCROLL':
      return `${message.targetKind ?? 'window'}${message.target ? ` target=${describeTarget(message.target)}` : ''} axis=${message.scrollAxis ?? '-'} idx=${message.scrollableIndex ?? '-'} x=${message.scrollXRatio.toFixed(3)} y=${message.scrollYRatio.toFixed(3)}`;
    case 'LOCATION_CHANGE':
      return `${message.pathname}${message.search}${message.hash}`;
    case 'KEY_DOWN':
    case 'KEY_UP':
      return `${message.key} code=${message.code} target=${describeTarget(message.target)}`;
    case 'INPUT':
    case 'CHANGE':
      return `target=${describeTarget(message.target)} valueLength=${message.value.length}`;
    case 'DRAG_START':
    case 'DRAG_END':
      return `${message.pointerType ?? 'mouse'} x=${message.xRatio.toFixed(3)} y=${message.yRatio.toFixed(3)}`;
    case 'SYNC_STATE_CHANGED':
      return `enabled=${message.state.enabled} direction=${message.state.direction}`;
    default:
      return message.type;
  }
}

export async function appendDebugLog(
  entry: Omit<DebugLogEntry, 'id' | 'ts'>
): Promise<void> {
  try {
    const raw = await chrome.storage.local.get(DEBUG_LOG_KEY);
    const logs = (raw[DEBUG_LOG_KEY] ?? []) as DebugLogEntry[];
    const next: DebugLogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
    };
    await chrome.storage.local.set({
      [DEBUG_LOG_KEY]: [...logs, next].slice(-DEBUG_LOG_LIMIT),
    });
  } catch {
    // Diagnostics must never break sync behavior.
  }
}

export async function loadDebugLogs(): Promise<DebugLogEntry[]> {
  const raw = await chrome.storage.local.get(DEBUG_LOG_KEY);
  return (raw[DEBUG_LOG_KEY] ?? []) as DebugLogEntry[];
}

export async function clearDebugLogs(): Promise<void> {
  await chrome.storage.local.set({ [DEBUG_LOG_KEY]: [] });
}

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
  if (shouldLogMessage(message)) {
    appendDebugLog({
      phase: 'send',
      messageType: message.type,
      detail: describeMessage(message),
    }).catch(() => {/* ignore */});
  }
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
