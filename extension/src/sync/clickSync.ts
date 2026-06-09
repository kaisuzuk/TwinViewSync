/**
 * clickSync.ts – Applies received click events to this tab's DOM.
 * Also triggers a ripple at the click position.
 */

import type { PointerMessage } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { showRipple } from '../overlay/clickRipple';

let applyingRemoteEvent = false;

function dispatchMouseEvent(
  target: Element,
  type: string,
  x: number,
  y: number,
  msg: PointerMessage
): void {
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: msg.button,
    buttons: msg.buttons,
    ctrlKey: msg.ctrlKey,
    shiftKey: msg.shiftKey,
    altKey: msg.altKey,
    metaKey: msg.metaKey,
    view: window,
  };
  const event = new MouseEvent(type, init);
  // Mark as remote so we don't re-forward it
  Object.defineProperty(event, REMOTE_EVENT_FLAG, { value: true });
  applyingRemoteEvent = true;
  target.dispatchEvent(event);
  applyingRemoteEvent = false;
}

export function applyClickEvent(msg: PointerMessage): void {
  if (applyingRemoteEvent) return;

  const x = msg.xRatio * window.innerWidth;
  const y = msg.yRatio * window.innerHeight;

  const target = document.elementFromPoint(x, y);
  if (!target) return;

  const eventType = eventTypeMap[msg.type];
  if (!eventType) return;

  // Show ripple for click/dblclick events
  if (msg.type === 'MOUSE_CLICK' || msg.type === 'MOUSE_DBLCLICK') {
    showRipple(msg.xRatio, msg.yRatio);
  }

  // For MOUSE_CLICK, dispatch mousedown → mouseup → click sequence
  if (msg.type === 'MOUSE_CLICK') {
    dispatchMouseEvent(target, 'mousedown', x, y, msg);
    dispatchMouseEvent(target, 'mouseup', x, y, msg);
  }

  dispatchMouseEvent(target, eventType, x, y, msg);
}

const eventTypeMap: Partial<Record<PointerMessage['type'], string>> = {
  MOUSE_DOWN: 'mousedown',
  MOUSE_UP: 'mouseup',
  MOUSE_CLICK: 'click',
  MOUSE_DBLCLICK: 'dblclick',
  CONTEXT_MENU: 'contextmenu',
};
