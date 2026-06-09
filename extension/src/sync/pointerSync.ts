/**
 * pointerSync.ts – Captures mouse pointer events and sends them to background.
 */

import type { PointerMessage } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;

function buildPointerMessage(
  type: PointerMessage['type'],
  e: MouseEvent
): PointerMessage {
  return {
    type,
    xRatio: e.clientX / window.innerWidth,
    yRatio: e.clientY / window.innerHeight,
    button: e.button,
    buttons: e.buttons,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  };
}

function onMouseMove(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  sendToBackground(buildPointerMessage('MOUSE_MOVE', e)).catch(() => {/* ignore */});
}

function onMouseDown(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  sendToBackground(buildPointerMessage('MOUSE_DOWN', e)).catch(() => {/* ignore */});
}

function onMouseUp(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  sendToBackground(buildPointerMessage('MOUSE_UP', e)).catch(() => {/* ignore */});
}

function onClick(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  sendToBackground(buildPointerMessage('MOUSE_CLICK', e)).catch(() => {/* ignore */});
}

function onDblClick(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  sendToBackground(buildPointerMessage('MOUSE_DBLCLICK', e)).catch(() => {/* ignore */});
}

function onContextMenu(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  sendToBackground(buildPointerMessage('CONTEXT_MENU', e)).catch(() => {/* ignore */});
}

export function startPointerSync(): void {
  if (active) return;
  active = true;
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mousedown', onMouseDown, { passive: true });
  window.addEventListener('mouseup', onMouseUp, { passive: true });
  window.addEventListener('click', onClick, { passive: true });
  window.addEventListener('dblclick', onDblClick, { passive: true });
  window.addEventListener('contextmenu', onContextMenu, { passive: true });
}

export function stopPointerSync(): void {
  active = false;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('click', onClick);
  window.removeEventListener('dblclick', onDblClick);
  window.removeEventListener('contextmenu', onContextMenu);
}
