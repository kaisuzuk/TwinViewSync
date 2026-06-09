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
  DragMessage,
  GridMessage,
  CompareOverlayMessage,
  BlinkMessage,
} from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { loadStorage } from '../shared/messaging';

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
import { applyClickEvent } from '../sync/clickSync';

// ─── Loop prevention ─────────────────────────────────────────────────────────
let applyingRemoteEvent = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

initCursorOverlay();

// Load initial state and configure listeners accordingly
loadStorage().then((storage) => {
  if (storage.syncState.enabled) {
    startAllSync();
  }
  if (storage.grid.visible) {
    showGrid(storage.grid);
  }
  if (storage.compareOverlay.visible && storage.compareOverlay.imageDataUrl) {
    setCompareImage(storage.compareOverlay.imageDataUrl, storage.compareOverlay.opacity);
  }
}).catch(() => {/* ignore */});

// ─── Sync control ─────────────────────────────────────────────────────────────

function startAllSync(): void {
  startPointerSync();
  startWheelSync();
  startDragSync();
  startScrollSync();
}

function stopAllSync(): void {
  stopPointerSync();
  stopWheelSync();
  stopDragSync();
  stopScrollSync();
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

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
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
      applyClickEvent(msg);
      break;
    }

    // ── Wheel ─────────────────────────────────────────────────────────────────
    case 'WHEEL': {
      applyWheelEvent(message as WheelMessage);
      break;
    }

    // ── Scroll ────────────────────────────────────────────────────────────────
    case 'WINDOW_SCROLL': {
      applyScrollEvent(message as ScrollMessage);
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
      showCompareOverlay(msg.opacity);
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
});
