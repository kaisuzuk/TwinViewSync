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
  DiffHighlightMessage,
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
import {
  setDiffHighlightImages,
  showDiffHighlight,
  hideDiffHighlight,
} from '../overlay/diffHighlightOverlay';

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

const CONTENT_VERSION = '2026-06-11-mobile-drag-v19';

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
    if (storage.diffHighlight.referenceImageDataUrl && storage.diffHighlight.targetImageDataUrl) {
      setDiffHighlightImages(
        storage.diffHighlight.referenceImageDataUrl,
        storage.diffHighlight.targetImageDataUrl,
        storage.diffHighlight.opacity,
        storage.diffHighlight.threshold,
        storage.diffHighlight.visible
      );
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

let remoteDragTarget: Element | null = null;

function applyDragEvent(msg: DragMessage): string {
  if (applyingRemoteEvent) return 'skipped: already applying remote event';
  const x = msg.xRatio * window.innerWidth;
  const y = msg.yRatio * window.innerHeight;
  const target = resolveDragTarget(msg, x, y);
  const pointerType = msg.pointerType ?? 'mouse';

  applyingRemoteEvent = true;
  try {
    if (pointerType === 'touch' || pointerType === 'pen') {
      dispatchPointerDragEvent(target, msg, x, y, pointerType);
      if (pointerType === 'touch') {
        dispatchTouchDragEvent(target, msg, x, y);
      }
    } else {
      dispatchMouseDragEvent(target, msg, x, y);
    }
  } finally {
    applyingRemoteEvent = false;
    if (msg.type === 'DRAG_END') {
      remoteDragTarget = null;
    }
  }

  return `applied ${pointerType} x=${msg.xRatio.toFixed(3)} y=${msg.yRatio.toFixed(3)}`;
}

function resolveDragTarget(msg: DragMessage, x: number, y: number): Element {
  if (msg.type === 'DRAG_START' || !remoteDragTarget || !document.documentElement.contains(remoteDragTarget)) {
    remoteDragTarget = document.elementFromPoint(x, y) ?? document.documentElement;
  }
  return remoteDragTarget;
}

function dispatchMouseDragEvent(target: Element, msg: DragMessage, x: number, y: number): void {
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
  target.dispatchEvent(event);
}

function dispatchPointerDragEvent(
  target: Element,
  msg: DragMessage,
  x: number,
  y: number,
  pointerType: 'touch' | 'pen'
): void {
  if (typeof PointerEvent !== 'function') return;
  const typeMap: Record<DragMessage['type'], string> = {
    DRAG_START: 'pointerdown',
    DRAG_MOVE: 'pointermove',
    DRAG_END: 'pointerup',
  };
  const event = new PointerEvent(typeMap[msg.type], {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: msg.button,
    buttons: msg.buttons,
    pointerId: msg.pointerId ?? 1,
    pointerType,
    isPrimary: true,
    width: pointerType === 'touch' ? 8 : 1,
    height: pointerType === 'touch' ? 8 : 1,
    pressure: msg.type === 'DRAG_END' ? 0 : 0.5,
    view: window,
  });
  Object.defineProperty(event, REMOTE_EVENT_FLAG, { value: true });
  target.dispatchEvent(event);
}

function dispatchTouchDragEvent(target: Element, msg: DragMessage, x: number, y: number): void {
  if (typeof Touch !== 'function' || typeof TouchEvent !== 'function') return;
  const typeMap: Record<DragMessage['type'], string> = {
    DRAG_START: 'touchstart',
    DRAG_MOVE: 'touchmove',
    DRAG_END: 'touchend',
  };
  const touch = new Touch({
    identifier: msg.pointerId ?? 1,
    target,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    pageX: x + window.scrollX,
    pageY: y + window.scrollY,
    radiusX: 4,
    radiusY: 4,
    rotationAngle: 0,
    force: msg.type === 'DRAG_END' ? 0 : 0.5,
  });
  const activeTouches = msg.type === 'DRAG_END' ? [] : [touch];
  const event = new TouchEvent(typeMap[msg.type], {
    bubbles: true,
    cancelable: true,
    touches: activeTouches,
    targetTouches: activeTouches,
    changedTouches: [touch],
  });
  Object.defineProperty(event, REMOTE_EVENT_FLAG, { value: true });
  target.dispatchEvent(event);
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
      const msg = message as DragMessage;
      const result = applyDragEvent(msg);
      if (message.type !== 'DRAG_MOVE') {
        logApply(msg, result);
      }
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

    // ── Diff Highlight ──────────────────────────────────────────────────────
    case 'SET_DIFF_IMAGE': {
      const msg = message as DiffHighlightMessage;
      if (
        msg.referenceImageDataUrl &&
        msg.targetImageDataUrl &&
        msg.opacity !== undefined &&
        msg.threshold !== undefined
      ) {
        setDiffHighlightImages(
          msg.referenceImageDataUrl,
          msg.targetImageDataUrl,
          msg.opacity,
          msg.threshold
        );
      }
      break;
    }
    case 'SHOW_DIFF_HIGHLIGHT': {
      const msg = message as DiffHighlightMessage;
      showDiffHighlight(
        msg.opacity,
        msg.threshold,
        msg.referenceImageDataUrl,
        msg.targetImageDataUrl
      );
      break;
    }
    case 'HIDE_DIFF_HIGHLIGHT': {
      hideDiffHighlight();
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
  message: PointerMessage | ScrollMessage | DragMessage | FormMessage | KeyboardMessage | ExtensionMessage,
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
  } else if (message.type === 'DRAG_START' || message.type === 'DRAG_END') {
    detail = `${message.pointerType ?? 'mouse'} x=${message.xRatio.toFixed(3)} y=${message.yRatio.toFixed(3)}`;
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
