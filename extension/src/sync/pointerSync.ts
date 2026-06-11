/**
 * pointerSync.ts – Captures mouse pointer events and sends them to background.
 */

import type { PointerMessage, TargetHint } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;

interface PointerDownSnapshot {
  target: TargetHint | undefined;
  x: number;
  y: number;
  button: number;
  ts: number;
}

let lastPointerDown: PointerDownSnapshot | null = null;

const ACTION_TARGET_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[onclick]',
  '[tabindex]',
].join(',');

function isRemoteEvent(e: Event): boolean {
  return Boolean(
    (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG] ||
    (window as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]
  );
}

function getElementType(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) return el.type;
  return '';
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function getElementText(el: Element): string {
  if (el instanceof HTMLInputElement) {
    return ['button', 'submit', 'reset'].includes(el.type) ? normalizeText(el.value) : '';
  }
  if (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    el.getAttribute('role') === 'button' ||
    el.getAttribute('role') === 'link'
  ) {
    return normalizeText(el.textContent ?? '');
  }
  return '';
}

function getActionTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest(ACTION_TARGET_SELECTOR) ?? target;
}

function buildTargetHint(target: Element | null): TargetHint | undefined {
  if (!target) return undefined;
  const rect = target.getBoundingClientRect();
  const x = rect.width > 0 ? rect.left + rect.width / 2 : 0;
  const y = rect.height > 0 ? rect.top + rect.height / 2 : 0;

  return {
    xRatio: window.innerWidth > 0 ? x / window.innerWidth : 0,
    yRatio: window.innerHeight > 0 ? y / window.innerHeight : 0,
    rectLeftRatio: window.innerWidth > 0 ? rect.left / window.innerWidth : 0,
    rectTopRatio: window.innerHeight > 0 ? rect.top / window.innerHeight : 0,
    rectWidthRatio: window.innerWidth > 0 ? rect.width / window.innerWidth : 0,
    rectHeightRatio: window.innerHeight > 0 ? rect.height / window.innerHeight : 0,
    tagName: target.tagName,
    id: target.id,
    className: typeof target.className === 'string' ? target.className : '',
    name: target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ? target.name : '',
    elementType: getElementType(target),
    ariaLabel: target.getAttribute('aria-label') ?? '',
    placeholder: target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ? target.placeholder : '',
    role: target.getAttribute('role') ?? '',
    text: getElementText(target),
  };
}

function getClickSequenceTarget(type: PointerMessage['type'], e: MouseEvent, currentTarget: TargetHint | undefined): TargetHint | undefined {
  if (type === 'MOUSE_DOWN') return currentTarget;
  if (type !== 'MOUSE_UP' && type !== 'MOUSE_CLICK') return currentTarget;
  if (!lastPointerDown) return currentTarget;
  if (lastPointerDown.button !== e.button) return currentTarget;

  const elapsed = performance.now() - lastPointerDown.ts;
  const distance = Math.hypot(e.clientX - lastPointerDown.x, e.clientY - lastPointerDown.y);
  if (elapsed > 1500 || distance > 24) return currentTarget;

  return lastPointerDown.target ?? currentTarget;
}

function buildPointerMessage(
  type: PointerMessage['type'],
  e: MouseEvent
): PointerMessage {
  const target = getActionTarget(e.target);
  const currentTarget = buildTargetHint(target);
  const sequenceTarget = getClickSequenceTarget(type, e, currentTarget);
  return {
    type,
    xRatio: e.clientX / window.innerWidth,
    yRatio: e.clientY / window.innerHeight,
    target: type === 'MOUSE_MOVE' ? undefined : sequenceTarget,
    button: e.button,
    buttons: e.buttons,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  };
}

function onMouseMove(e: MouseEvent): void {
  if (!active || isRemoteEvent(e)) return;
  sendToBackground(buildPointerMessage('MOUSE_MOVE', e)).catch(() => {/* ignore */});
}

function onMouseDown(e: MouseEvent): void {
  if (!active || isRemoteEvent(e)) return;
  const target = buildTargetHint(getActionTarget(e.target));
  lastPointerDown = {
    target,
    x: e.clientX,
    y: e.clientY,
    button: e.button,
    ts: performance.now(),
  };
  sendToBackground({
    ...buildPointerMessage('MOUSE_DOWN', e),
    target,
  }).catch(() => {/* ignore */});
}

function onMouseUp(e: MouseEvent): void {
  if (!active || isRemoteEvent(e)) return;
  sendToBackground(buildPointerMessage('MOUSE_UP', e)).catch(() => {/* ignore */});
}

function onClick(e: MouseEvent): void {
  if (!active || isRemoteEvent(e)) return;
  sendToBackground(buildPointerMessage('MOUSE_CLICK', e)).catch(() => {/* ignore */});
  lastPointerDown = null;
}

function onDblClick(e: MouseEvent): void {
  if (!active || isRemoteEvent(e)) return;
  sendToBackground(buildPointerMessage('MOUSE_DBLCLICK', e)).catch(() => {/* ignore */});
}

function onContextMenu(e: MouseEvent): void {
  if (!active || isRemoteEvent(e)) return;
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
