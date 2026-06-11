/**
 * content.ts – Injected into every page.
 *
 * Responsibilities:
 *  - Listen for messages from the background service worker
 *  - Start / stop sync listeners based on sync state
 *  - Apply received events to the page
 *  - Manage overlay elements (cursor, grid, compare overlay)
 */

import type {
  ExtensionMessage,
  PointerMessage,
  WheelMessage,
  ScrollMessage,
  LocationMessage,
  DragMessage,
  FormMessage,
  KeyboardMessage,
  GridMessage,
  CompareOverlayMessage,
  BlinkMessage,
} from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { appendDebugLog, loadStorage } from '../shared/messaging';

// Overlay
import { initCursorOverlay, moveCursor } from '../overlay/cursorOverlay';
import { showRipple } from '../overlay/clickRipple';
import { showGrid, hideGrid, updateGrid } from '../overlay/gridOverlay';
import {
  setCompareImage,
  showCompareOverlay,
  hideCompareOverlay,
  startBlink,
  stopBlink,
} from '../overlay/compareOverlay';

// Sync senders
import { startPointerSync, stopPointerSync } from '../sync/pointerSync';
import { startWheelSync, stopWheelSync } from '../sync/wheelSync';
import { startDragSync, stopDragSync } from '../sync/dragSync';
import { startScrollSync, stopScrollSync, applyScrollEvent } from '../sync/scrollSync';
import { startLocationSync, stopLocationSync, applyLocationChange } from '../sync/locationSync';
import { applyClickEvent } from '../sync/clickSync';
import { startInputSync, stopInputSync, applyFormEvent, applyKeyboardEvent } from '../sync/inputSync';

declare global {
  interface Window {
    __twinViewSyncContentLoaded?: boolean;
    __twinViewSyncContentVersion?: string;
    __twinViewSyncCleanup?: () => void;
  }
}

const CONTENT_VERSION = '2026-06-11-remote-button-release-v17';

if (window.__twinViewSyncContentVersion !== CONTENT_VERSION) {
  window.__twinViewSyncCleanup?.();
  window.__twinViewSyncContentLoaded = true;
  window.__twinViewSyncContentVersion = CONTENT_VERSION;
  bootstrap();
}

// ─── Loop prevention ─────────────────────────────────────────────────────────
let applyingRemoteEvent = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

function bootstrap(): void {
  initCursorOverlay();

  // Load initial state and configure listeners accordingly
  loadStorage().then((storage) => {
    if (storage.syncState.enabled) {
      startAllSync();
    }
    if (storage.grid.visible) {
      showGrid(storage.grid);
    }
    if (storage.compareOverlay.imageDataUrl) {
      setCompareImage(storage.compareOverlay.imageDataUrl, storage.compareOverlay.opacity);
      if (!storage.compareOverlay.visible) {
        hideCompareOverlay();
      }
    }
  }).catch(() => {/* ignore */});

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  window.__twinViewSyncCleanup = () => {
    stopAllSync();
    chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  };
}

function handleRuntimeMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  if (message.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }

  handleMessage(message);
  return false;
}

// ─── Sync control ─────────────────────────────────────────────────────────────

function startAllSync(): void {
  startPointerSync();
  startWheelSync();
  startDragSync();
  startScrollSync();
  startLocationSync();
  startInputSync();
}

function stopAllSync(): void {
  stopPointerSync();
  stopWheelSync();
  stopDragSync();
  stopScrollSync();
  stopLocationSync();
  stopInputSync();
}

// ─── Apply wheel event ───────────────────────────────────────────────────────

function applyWheelEvent(msg: WheelMessage): void {
  if (applyingRemoteEvent) return;

  const x = msg.xRatio * window.innerWidth;
  const y = msg.yRatio * window.innerHeight;

  const target = document.elementFromPoint(x, y);
  if (!target) return;

  const init: WheelEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    deltaX: msg.deltaX,
    deltaY: msg.deltaY,
    deltaZ: msg.deltaZ,
    deltaMode: msg.deltaMode,
    ctrlKey: msg.ctrlKey,
    shiftKey: msg.shiftKey,
    view: window,
  };
  const event = new WheelEvent('wheel', init);
  Object.defineProperty(event, REMOTE_EVENT_FLAG, { value: true });

  applyingRemoteEvent = true;
  target.dispatchEvent(event);
  applyingRemoteEvent = false;
}

// ─── Apply drag event ────────────────────────────────────────────────────────

function applyDragEvent(msg: DragMessage): void {
  if (applyingRemoteEvent) return;

  const x = msg.xRatio * window.innerWidth;
  const y = msg.yRatio * window.innerHeight;

  const target = document.elementFromPoint(x, y) ?? document.documentElement;

  const typeMap: Record<DragMessage['type'], string> = {
    DRAG_START: 'mousedown',
    DRAG_MOVE: 'mousemove',
    DRAG_END: 'mouseup',
  };
  const eventType = typeMap[msg.type];

  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: msg.button,
    buttons: msg.buttons,
    view: window,
  };
  const event = new MouseEvent(eventType, init);
  Object.defineProperty(event, REMOTE_EVENT_FLAG, { value: true });

  applyingRemoteEvent = true;
  target.dispatchEvent(event);
  applyingRemoteEvent = false;
}

// ─── Message handler ──────────────────────────────────────────────────────────

function handleMessage(message: ExtensionMessage): void {
  switch (message.type) {
    // ── Pointer ──────────────────────────────────────────────────────────────
    case 'MOUSE_MOVE': {
      const msg = message as PointerMessage;
      moveCursor(msg.xRatio, msg.yRatio);
      break;
    }

    case 'MOUSE_DOWN':
    case 'MOUSE_UP':
    case 'MOUSE_CLICK':
    case 'MOUSE_DBLCLICK':
    case 'CONTEXT_MENU': {
      const msg = message as PointerMessage;
      if (message.type === 'MOUSE_CLICK' || message.type === 'MOUSE_DBLCLICK') {
        showRipple(msg.xRatio, msg.yRatio);
      }
      logApply(msg, applyClickEvent(msg));
      break;
    }

    // ── Wheel ─────────────────────────────────────────────────────────────────
    case 'WHEEL': {
      applyWheelEvent(message as WheelMessage);
      break;
    }

    // ── Scroll ────────────────────────────────────────────────────────────────
    case 'WINDOW_SCROLL': {
      const msg = message as ScrollMessage;
      logApply(msg, applyScrollEvent(msg));
      break;
    }
    case 'LOCATION_CHANGE': {
      const msg = message as LocationMessage;
      logApply(msg, applyLocationChange(msg));
      break;
    }

    // ── Input / Keyboard ─────────────────────────────────────────────────────
    case 'INPUT':
    case 'CHANGE': {
      const msg = message as FormMessage;
      logApply(msg, applyFormEvent(msg));
      break;
    }
    case 'KEY_DOWN':
    case 'KEY_UP': {
      const msg = message as KeyboardMessage;
      logApply(msg, applyKeyboardEvent(msg));
      break;
    }

    // ── Drag ──────────────────────────────────────────────────────────────────
    case 'DRAG_START':
    case 'DRAG_MOVE':
    case 'DRAG_END': {
      applyDragEvent(message as DragMessage);
      break;
    }

    // ── Grid ──────────────────────────────────────────────────────────────────
    case 'SHOW_GRID': {
      const msg = message as GridMessage;
      if (msg.settings) showGrid(msg.settings);
      break;
    }
    case 'HIDE_GRID': {
      hideGrid();
      break;
    }
    case 'UPDATE_GRID': {
      const msg = message as GridMessage;
      if (msg.settings) updateGrid(msg.settings);
      break;
    }

    // ── Compare Overlay ───────────────────────────────────────────────────────
    case 'SET_COMPARE_IMAGE': {
      const msg = message as CompareOverlayMessage;
      if (msg.imageDataUrl && msg.opacity !== undefined) {
        setCompareImage(msg.imageDataUrl, msg.opacity);
      }
      break;
    }
    case 'SHOW_COMPARE_OVERLAY': {
      const msg = message as CompareOverlayMessage;
      showCompareOverlay(msg.opacity, msg.imageDataUrl);
      break;
    }
    case 'HIDE_COMPARE_OVERLAY': {
      hideCompareOverlay();
      break;
    }

    // ── Blink ─────────────────────────────────────────────────────────────────
    case 'START_BLINK': {
      const msg = message as BlinkMessage;
      startBlink(msg.interval ?? 500, msg.imageDataUrl);
      break;
    }
    case 'STOP_BLINK': {
      stopBlink();
      break;
    }

    // ── State change ──────────────────────────────────────────────────────────
    case 'SYNC_STATE_CHANGED': {
      logApply(message);
      loadStorage().then((storage) => {
        if (storage.syncState.enabled) {
          startAllSync();
        } else {
          stopAllSync();
        }
      }).catch(() => {/* ignore */});
      break;
    }

    default:
      break;
  }
}

function logApply(
  message: PointerMessage | ScrollMessage | FormMessage | KeyboardMessage | ExtensionMessage,
  result?: string
): void {
  let detail: string = message.type;
  const describeTarget = (target: { tagName: string; id: string; className?: string }): string => {
    const id = target.id ? `#${target.id}` : '';
    const className = target.className
      ? `.${target.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '';
    return `${target.tagName}${id}${className}`;
  };

  if (message.type === 'WINDOW_SCROLL') {
    detail = `${message.targetKind ?? 'window'}${message.target ? ` target=${describeTarget(message.target)}` : ''} axis=${message.scrollAxis ?? '-'} idx=${message.scrollableIndex ?? '-'} x=${message.scrollXRatio.toFixed(3)} y=${message.scrollYRatio.toFixed(3)}`;
  } else if (message.type === 'LOCATION_CHANGE') {
    detail = `${message.pathname}${message.search}${message.hash}`;
  } else if (message.type === 'MOUSE_DOWN' || message.type === 'MOUSE_UP' || message.type === 'MOUSE_CLICK') {
    detail = `${message.target ? `target=${describeTarget(message.target)} ` : ''}x=${message.xRatio.toFixed(3)} y=${message.yRatio.toFixed(3)}`;
  } else if (message.type === 'KEY_DOWN' || message.type === 'KEY_UP') {
    detail = `${message.key} code=${message.code} target=${describeTarget(message.target)}`;
  } else if (message.type === 'INPUT' || message.type === 'CHANGE') {
    detail = `target=${describeTarget(message.target)} valueLength=${message.value.length}`;
  } else if (message.type === 'SYNC_STATE_CHANGED') {
    detail = `enabled=${message.state.enabled} direction=${message.state.direction}`;
  }

  appendDebugLog({
    phase: 'apply',
    messageType: message.type,
    sourceTabId: message.sourceTabId,
    detail: result ? `${detail} -> ${result}` : detail,
  }).catch(() => {/* ignore */});
}
