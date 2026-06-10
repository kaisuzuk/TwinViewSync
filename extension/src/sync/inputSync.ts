/**
 * inputSync.ts - Captures and applies keyboard and form value events.
 */

import type { FormMessage, KeyboardMessage, TargetHint } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

let active = false;
let applyingRemoteEvent = false;

function isRemoteEvent(e: Event): boolean {
  return Boolean((e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]);
}

function isFormControl(el: Element | null): el is FormControl {
  return el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement;
}

function isEditable(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.isContentEditable;
}

function isUnsupportedInput(el: Element | null): boolean {
  return el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'file');
}

function getElementType(el: Element): string {
  return el instanceof HTMLInputElement ? el.type : '';
}

function buildTargetHint(target: Element | null): TargetHint {
  const el = target instanceof Element ? target : document.documentElement;
  const rect = el.getBoundingClientRect();
  const x = rect.width > 0 ? rect.left + rect.width / 2 : 0;
  const y = rect.height > 0 ? rect.top + rect.height / 2 : 0;

  return {
    xRatio: window.innerWidth > 0 ? x / window.innerWidth : 0,
    yRatio: window.innerHeight > 0 ? y / window.innerHeight : 0,
    tagName: el.tagName,
    id: el.id,
    className: typeof el.className === 'string' ? el.className : '',
    name: el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ? el.name : '',
    elementType: getElementType(el),
    ariaLabel: el.getAttribute('aria-label') ?? '',
    placeholder: el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ? el.placeholder : '',
  };
}

function targetMatches(el: Element, hint: TargetHint): boolean {
  if (el.tagName !== hint.tagName) return false;
  if (hint.elementType && getElementType(el) !== hint.elementType) return false;

  const name = el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ? el.name : '';
  const placeholder = el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ? el.placeholder : '';

  if (hint.name && name !== hint.name) return false;
  if (hint.ariaLabel && (el.getAttribute('aria-label') ?? '') !== hint.ariaLabel) return false;
  if (hint.placeholder && placeholder !== hint.placeholder) return false;
  return true;
}

function findTarget(hint: TargetHint): Element | null {
  if (hint.id) {
    const byId = document.getElementById(hint.id);
    if (byId && targetMatches(byId, hint)) return byId;
  }

  const x = hint.xRatio * window.innerWidth;
  const y = hint.yRatio * window.innerHeight;
  const byPoint = document.elementFromPoint(x, y);
  if (byPoint && targetMatches(byPoint, hint)) return byPoint;

  if (hint.name) {
    const byName = Array.from(document.getElementsByName(hint.name));
    const matched = byName.find((el) => targetMatches(el, hint));
    if (matched) return matched;
  }

  const candidates = Array.from(document.querySelectorAll(hint.tagName.toLowerCase()));
  return candidates.find((el) => targetMatches(el, hint)) ?? byPoint;
}

function buildFormMessage(type: FormMessage['type'], e: Event): FormMessage | null {
  const target = e.target instanceof Element ? e.target : null;
  if (!isFormControl(target) && !isEditable(target)) return null;
  if (isUnsupportedInput(target)) return null;

  const value = isEditable(target) ? target.textContent ?? '' : (target as FormControl).value;

  return {
    type,
    target: buildTargetHint(target),
    value,
    checked: target instanceof HTMLInputElement &&
      (target.type === 'checkbox' || target.type === 'radio') ? target.checked : null,
    selectedIndex: target instanceof HTMLSelectElement ? target.selectedIndex : null,
    selectionStart: target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ? target.selectionStart : null,
    selectionEnd: target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ? target.selectionEnd : null,
  };
}

function buildKeyboardMessage(type: KeyboardMessage['type'], e: KeyboardEvent): KeyboardMessage {
  const target = e.target instanceof Element ? e.target : document.activeElement;
  return {
    type,
    target: buildTargetHint(target),
    key: e.key,
    code: e.code,
    location: e.location,
    keyCode: e.keyCode,
    which: e.which,
    charCode: e.charCode,
    repeat: e.repeat,
    isComposing: e.isComposing,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  };
}

function onInput(e: Event): void {
  if (!active || applyingRemoteEvent || isRemoteEvent(e)) return;
  const msg = buildFormMessage('INPUT', e);
  if (msg) sendToBackground(msg).catch(() => {/* ignore */});
}

function onChange(e: Event): void {
  if (!active || applyingRemoteEvent || isRemoteEvent(e)) return;
  const msg = buildFormMessage('CHANGE', e);
  if (msg) sendToBackground(msg).catch(() => {/* ignore */});
}

function onKeyDown(e: KeyboardEvent): void {
  if (!active || applyingRemoteEvent || isRemoteEvent(e)) return;
  if (isUnsupportedInput(e.target instanceof Element ? e.target : null)) return;
  sendToBackground(buildKeyboardMessage('KEY_DOWN', e)).catch(() => {/* ignore */});
}

function onKeyUp(e: KeyboardEvent): void {
  if (!active || applyingRemoteEvent || isRemoteEvent(e)) return;
  if (isUnsupportedInput(e.target instanceof Element ? e.target : null)) return;
  sendToBackground(buildKeyboardMessage('KEY_UP', e)).catch(() => {/* ignore */});
}

export function startInputSync(): void {
  if (active) return;
  active = true;
  document.addEventListener('input', onInput, { capture: true });
  document.addEventListener('change', onChange, { capture: true });
  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });
}

export function stopInputSync(): void {
  active = false;
  document.removeEventListener('input', onInput, { capture: true });
  document.removeEventListener('change', onChange, { capture: true });
  window.removeEventListener('keydown', onKeyDown, { capture: true });
  window.removeEventListener('keyup', onKeyUp, { capture: true });
}

export function applyFormEvent(msg: FormMessage): string {
  if (applyingRemoteEvent) return 'skipped: already applying remote event';

  const target = findTarget(msg.target);
  if (!isFormControl(target) && !isEditable(target)) return 'target not found or not editable';

  applyingRemoteEvent = true;

  if (target instanceof HTMLInputElement) {
    if (msg.checked !== null && (target.type === 'checkbox' || target.type === 'radio')) {
      target.checked = msg.checked;
    } else if (target.type !== 'file') {
      target.value = msg.value;
    }
  } else if (target instanceof HTMLTextAreaElement) {
    target.value = msg.value;
  } else if (target instanceof HTMLSelectElement) {
    if (msg.selectedIndex !== null) target.selectedIndex = msg.selectedIndex;
    target.value = msg.value;
  } else {
    target.textContent = msg.value;
  }

  if (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    msg.selectionStart !== null &&
    msg.selectionEnd !== null &&
    target.type !== 'checkbox' &&
    target.type !== 'radio'
  ) {
    target.setSelectionRange(msg.selectionStart, msg.selectionEnd);
  }

  const event = msg.type === 'INPUT'
    ? new InputEvent('input', { bubbles: true, cancelable: true, data: null, inputType: 'insertText' })
    : new Event('change', { bubbles: true, cancelable: true });
  Object.defineProperty(event, REMOTE_EVENT_FLAG, { value: true });
  target.dispatchEvent(event);

  applyingRemoteEvent = false;
  return `applied target=${target.tagName}${target.id ? `#${target.id}` : ''}`;
}

export function applyKeyboardEvent(msg: KeyboardMessage): string {
  if (applyingRemoteEvent) return 'skipped: already applying remote event';

  const foundTarget = findTarget(msg.target);
  const target = foundTarget ?? document.activeElement ?? document.documentElement;
  const eventType = msg.type === 'KEY_DOWN' ? 'keydown' : 'keyup';

  function buildEvent(): KeyboardEvent {
    const event = new KeyboardEvent(eventType, {
      bubbles: true,
      cancelable: true,
      key: msg.key,
      code: msg.code,
      location: msg.location,
      repeat: msg.repeat,
      isComposing: msg.isComposing,
      ctrlKey: msg.ctrlKey,
      shiftKey: msg.shiftKey,
      altKey: msg.altKey,
      metaKey: msg.metaKey,
    });
    Object.defineProperties(event, {
      keyCode: { value: msg.keyCode },
      which: { value: msg.which },
      charCode: { value: msg.charCode },
    });
    Object.defineProperty(event, REMOTE_EVENT_FLAG, { value: true });
    return event;
  }

  applyingRemoteEvent = true;

  if (
    target === document.body ||
    target === document.documentElement
  ) {
    document.dispatchEvent(buildEvent());
    window.dispatchEvent(buildEvent());
    applyingRemoteEvent = false;
    return 'applied global document+window';
  }

  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
  }

  target.dispatchEvent(buildEvent());
  applyingRemoteEvent = false;
  return `applied target=${target instanceof Element ? `${target.tagName}${target.id ? `#${target.id}` : ''}` : 'unknown'}`;
}
