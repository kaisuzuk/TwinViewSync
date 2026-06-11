/**
 * dragSync.ts – Captures drag gestures and forwards DRAG_START / DRAG_MOVE / DRAG_END messages.
 */

import type { DragMessage } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;
let dragging = false;
let dragSource: 'mouse' | 'pointer' | 'touch' | null = null;
let activePointerId: number | null = null;
let activeTouchId: number | null = null;
let suppressMouseUntil = 0;
let suppressTouchUntil = 0;

function isRemoteEvent(e: Event): boolean {
  return Boolean(
    (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG] ||
    (window as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]
  );
}

function buildDragMsg(
  type: DragMessage['type'],
  clientX: number,
  clientY: number,
  button: number,
  buttons: number,
  pointerType: DragMessage['pointerType'] = 'mouse',
  pointerId?: number
): DragMessage {
  return {
    type,
    xRatio: window.innerWidth > 0 ? clientX / window.innerWidth : 0,
    yRatio: window.innerHeight > 0 ? clientY / window.innerHeight : 0,
    button,
    buttons,
    pointerType,
    pointerId,
  };
}

function sendDragMsg(
  type: DragMessage['type'],
  clientX: number,
  clientY: number,
  button: number,
  buttons: number,
  pointerType: DragMessage['pointerType'] = 'mouse',
  pointerId?: number
): void {
  sendToBackground(buildDragMsg(type, clientX, clientY, button, buttons, pointerType, pointerId)).catch(() => {/* ignore */});
}

function onMouseDown(e: MouseEvent): void {
  if (!active || isRemoteEvent(e) || performance.now() < suppressMouseUntil || dragSource !== null) return;
  dragging = true;
  dragSource = 'mouse';
  sendDragMsg('DRAG_START', e.clientX, e.clientY, e.button, e.buttons, 'mouse');
}

function onMouseMove(e: MouseEvent): void {
  if (!active || !dragging || dragSource !== 'mouse' || isRemoteEvent(e)) return;
  sendDragMsg('DRAG_MOVE', e.clientX, e.clientY, e.button, e.buttons, 'mouse');
}

function onMouseUp(e: MouseEvent): void {
  if (!active || dragSource !== 'mouse' || isRemoteEvent(e)) return;
  endDrag(e.clientX, e.clientY, e.button, 0, 'mouse');
}

function onPointerDown(e: PointerEvent): void {
  if (!active || isRemoteEvent(e) || e.pointerType === 'mouse' || dragSource !== null) return;
  dragging = true;
  dragSource = 'pointer';
  activePointerId = e.pointerId;
  suppressMouseUntil = performance.now() + 800;
  suppressTouchUntil = performance.now() + 800;
  sendDragMsg('DRAG_START', e.clientX, e.clientY, e.button, e.buttons || 1, normalizePointerType(e.pointerType), e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!active || !dragging || dragSource !== 'pointer' || activePointerId !== e.pointerId || isRemoteEvent(e)) return;
  suppressMouseUntil = performance.now() + 800;
  suppressTouchUntil = performance.now() + 800;
  sendDragMsg('DRAG_MOVE', e.clientX, e.clientY, e.button, e.buttons || 1, normalizePointerType(e.pointerType), e.pointerId);
}

function onPointerUp(e: PointerEvent): void {
  if (!active || dragSource !== 'pointer' || activePointerId !== e.pointerId || isRemoteEvent(e)) return;
  suppressMouseUntil = performance.now() + 800;
  suppressTouchUntil = performance.now() + 800;
  endDrag(e.clientX, e.clientY, e.button, 0, normalizePointerType(e.pointerType), e.pointerId);
}

function onPointerCancel(e: PointerEvent): void {
  onPointerUp(e);
}

function normalizePointerType(pointerType: string): DragMessage['pointerType'] {
  if (pointerType === 'pen') return 'pen';
  if (pointerType === 'touch') return 'touch';
  return 'mouse';
}

function getTrackedTouch(e: TouchEvent): Touch | null {
  const touches = Array.from(e.changedTouches);
  if (activeTouchId === null) return touches[0] ?? null;
  return touches.find((touch) => touch.identifier === activeTouchId) ?? null;
}

function onTouchStart(e: TouchEvent): void {
  if (!active || isRemoteEvent(e) || performance.now() < suppressTouchUntil || dragSource !== null) return;
  const touch = getTrackedTouch(e);
  if (!touch) return;
  dragging = true;
  dragSource = 'touch';
  activeTouchId = touch.identifier;
  suppressMouseUntil = performance.now() + 800;
  sendDragMsg('DRAG_START', touch.clientX, touch.clientY, 0, 1, 'touch', touch.identifier);
}

function onTouchMove(e: TouchEvent): void {
  if (!active || !dragging || dragSource !== 'touch' || isRemoteEvent(e)) return;
  const touch = getTrackedTouch(e);
  if (!touch) return;
  suppressMouseUntil = performance.now() + 800;
  sendDragMsg('DRAG_MOVE', touch.clientX, touch.clientY, 0, 1, 'touch', touch.identifier);
}

function onTouchEnd(e: TouchEvent): void {
  if (!active || dragSource !== 'touch' || isRemoteEvent(e)) return;
  const touch = getTrackedTouch(e);
  if (!touch) return;
  suppressMouseUntil = performance.now() + 800;
  endDrag(touch.clientX, touch.clientY, 0, 0, 'touch', touch.identifier);
}

function onTouchCancel(e: TouchEvent): void {
  onTouchEnd(e);
}

function endDrag(
  clientX: number,
  clientY: number,
  button: number,
  buttons: number,
  pointerType: DragMessage['pointerType'] = 'mouse',
  pointerId?: number
): void {
  if (dragging) {
    sendDragMsg('DRAG_END', clientX, clientY, button, buttons, pointerType, pointerId);
  }
  dragging = false;
  dragSource = null;
  activePointerId = null;
  activeTouchId = null;
}

export function startDragSync(): void {
  if (active) return;
  active = true;
  window.addEventListener('mousedown', onMouseDown, { passive: true, capture: true });
  window.addEventListener('mousemove', onMouseMove, { passive: true, capture: true });
  window.addEventListener('mouseup', onMouseUp, { passive: true, capture: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true, capture: true });
  window.addEventListener('pointercancel', onPointerCancel, { passive: true, capture: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
  window.addEventListener('touchcancel', onTouchCancel, { passive: true, capture: true });
}

export function stopDragSync(): void {
  active = false;
  dragging = false;
  dragSource = null;
  activePointerId = null;
  activeTouchId = null;
  window.removeEventListener('mousedown', onMouseDown, { capture: true });
  window.removeEventListener('mousemove', onMouseMove, { capture: true });
  window.removeEventListener('mouseup', onMouseUp, { capture: true });
  window.removeEventListener('pointerdown', onPointerDown, { capture: true });
  window.removeEventListener('pointermove', onPointerMove, { capture: true });
  window.removeEventListener('pointerup', onPointerUp, { capture: true });
  window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
  window.removeEventListener('touchstart', onTouchStart, { capture: true });
  window.removeEventListener('touchmove', onTouchMove, { capture: true });
  window.removeEventListener('touchend', onTouchEnd, { capture: true });
  window.removeEventListener('touchcancel', onTouchCancel, { capture: true });
}
