/**
 * dragSync.ts – Captures drag gestures (mousedown → mousemove → mouseup)
 * and forwards DRAG_START / DRAG_MOVE / DRAG_END messages.
 */

import type { DragMessage } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;
let dragging = false;

function buildDragMsg(
  type: DragMessage['type'],
  e: MouseEvent
): DragMessage {
  return {
    type,
    xRatio: e.clientX / window.innerWidth,
    yRatio: e.clientY / window.innerHeight,
    button: e.button,
    buttons: e.buttons,
  };
}

function onMouseDown(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  dragging = true;
  sendToBackground(buildDragMsg('DRAG_START', e)).catch(() => {/* ignore */});
}

function onMouseMove(e: MouseEvent): void {
  if (!active || !dragging || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  sendToBackground(buildDragMsg('DRAG_MOVE', e)).catch(() => {/* ignore */});
}

function onMouseUp(e: MouseEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  if (dragging) {
    dragging = false;
    sendToBackground(buildDragMsg('DRAG_END', e)).catch(() => {/* ignore */});
  }
}

export function startDragSync(): void {
  if (active) return;
  active = true;
  window.addEventListener('mousedown', onMouseDown, { passive: true, capture: true });
  window.addEventListener('mousemove', onMouseMove, { passive: true, capture: true });
  window.addEventListener('mouseup', onMouseUp, { passive: true, capture: true });
}

export function stopDragSync(): void {
  active = false;
  dragging = false;
  window.removeEventListener('mousedown', onMouseDown, { capture: true });
  window.removeEventListener('mousemove', onMouseMove, { capture: true });
  window.removeEventListener('mouseup', onMouseUp, { capture: true });
}
