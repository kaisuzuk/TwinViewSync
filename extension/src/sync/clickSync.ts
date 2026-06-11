/**
 * clickSync.ts – Applies received click events to this tab's DOM.
 * Also triggers a ripple at the click position.
 */

import type { PointerMessage, TargetHint } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { showRipple } from '../overlay/clickRipple';

let applyingRemoteEvent = false;

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

interface ClickTargetResult {
  target: Element;
  score: number;
  strategy: string;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function getElementType(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) return el.type;
  return '';
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

function elementClassName(el: Element): string {
  return typeof el.className === 'string' ? el.className : '';
}

function classOverlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const aClasses = new Set(a.split(/\s+/).filter(Boolean));
  const bClasses = b.split(/\s+/).filter(Boolean);
  return bClasses.reduce((score, className) => score + (aClasses.has(className) ? 1 : 0), 0);
}

function classTokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function meaningfulClassTokens(className: string): string[] {
  const commonClasses = new Set(['row', 'col', 'container', 'no-gutters']);
  return classTokens(className).filter((token) => {
    if (commonClasses.has(token)) return false;
    if (token.startsWith('v-') || token.startsWith('theme--')) return false;
    return true;
  });
}

function meaningfulClassOverlapScore(a: string, b: string): number {
  const aClasses = new Set(meaningfulClassTokens(a));
  return meaningfulClassTokens(b).reduce((score, className) => score + (aClasses.has(className) ? 1 : 0), 0);
}

function describeElement(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const className = elementClassName(el)
    ? `.${elementClassName(el).trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  const text = getElementText(el);
  return `${el.tagName}${id}${className}${text ? ` text="${text}"` : ''}`;
}

function targetMatches(el: Element, hint: TargetHint): boolean {
  if (hint.tagName && el.tagName !== hint.tagName) return false;
  if (hint.elementType && getElementType(el) !== hint.elementType) return false;
  if (hint.role && (el.getAttribute('role') ?? '') !== hint.role) return false;

  const name = el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ? el.name : '';
  const placeholder = el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ? el.placeholder : '';

  if (hint.name && name !== hint.name) return false;
  if (hint.ariaLabel && (el.getAttribute('aria-label') ?? '') !== hint.ariaLabel) return false;
  if (hint.placeholder && placeholder !== hint.placeholder) return false;
  if (hint.text !== undefined && getElementText(el) !== hint.text) return false;
  return true;
}

function rectRatioScore(el: Element, hint: TargetHint): number {
  if (
    hint.rectLeftRatio === undefined ||
    hint.rectTopRatio === undefined ||
    hint.rectWidthRatio === undefined ||
    hint.rectHeightRatio === undefined
  ) {
    return 0;
  }

  const rect = el.getBoundingClientRect();
  const leftRatio = window.innerWidth > 0 ? rect.left / window.innerWidth : 0;
  const topRatio = window.innerHeight > 0 ? rect.top / window.innerHeight : 0;
  const widthRatio = window.innerWidth > 0 ? rect.width / window.innerWidth : 0;
  const heightRatio = window.innerHeight > 0 ? rect.height / window.innerHeight : 0;
  const delta =
    Math.abs(leftRatio - hint.rectLeftRatio) +
    Math.abs(topRatio - hint.rectTopRatio) +
    Math.abs(widthRatio - hint.rectWidthRatio) +
    Math.abs(heightRatio - hint.rectHeightRatio);

  return Math.max(0, 50 - delta * 50);
}

function getActionTarget(target: Element | null): Element | null {
  if (!target) return null;
  return target.closest(ACTION_TARGET_SELECTOR) ?? target;
}

function collectCandidateTargets(hint?: TargetHint): Element[] {
  const candidates = Array.from(document.querySelectorAll(ACTION_TARGET_SELECTOR));
  if (hint?.tagName) {
    candidates.push(...Array.from(document.querySelectorAll(hint.tagName.toLowerCase())));
  }
  return candidates.filter((el, index, all) => all.indexOf(el) === index);
}

function scoreCandidate(el: Element, hint: TargetHint, pointX: number, pointY: number): number {
  const rect = el.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const distance = Math.hypot(centerX - pointX, centerY - pointY);
  const maxDistance = Math.hypot(window.innerWidth, window.innerHeight) || 1;
  const elClassName = elementClassName(el);

  let score = 0;
  if (hint.id && el.id === hint.id) score += 120;
  if (targetMatches(el, hint)) score += 90;
  if (hint.tagName && el.tagName === hint.tagName) score += 20;
  if (hint.role && (el.getAttribute('role') ?? '') === hint.role) score += 25;
  if (hint.text && getElementText(el) === hint.text) score += 120;
  if (hint.ariaLabel && (el.getAttribute('aria-label') ?? '') === hint.ariaLabel) score += 60;
  if (hint.className && elClassName === hint.className) score += 60;
  const meaningfulHintClasses = meaningfulClassTokens(hint.className);
  const meaningfulOverlap = meaningfulClassOverlapScore(elClassName, hint.className);
  score += meaningfulOverlap * 140;
  if (meaningfulHintClasses.length > 0 && meaningfulOverlap === 0) score -= 80;
  score += Math.min(60, classOverlapScore(elClassName, hint.className) * 15);
  score += rectRatioScore(el, hint);
  score += Math.max(0, 30 - (distance / maxDistance) * 30);
  return score;
}

function findTarget(msg: PointerMessage, x: number, y: number): ClickTargetResult | null {
  const byPoint = getActionTarget(document.elementFromPoint(x, y));
  if (!msg.target) {
    return byPoint ? { target: byPoint, score: 0, strategy: 'point' } : null;
  }

  if (msg.target.id) {
    const byId = document.getElementById(msg.target.id);
    if (byId && targetMatches(byId, msg.target)) {
      return { target: byId, score: 999, strategy: 'id' };
    }
  }

  const candidates = collectCandidateTargets(msg.target);
  if (byPoint && !candidates.includes(byPoint)) candidates.push(byPoint);

  const best = candidates
    .map((target) => ({
      target,
      score: scoreCandidate(target, msg.target as TargetHint, x, y),
      strategy: byPoint === target ? 'scored+point' : 'scored',
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return byPoint ? { target: byPoint, score: 0, strategy: 'point-fallback' } : null;
  if (byPoint && best.score < 40) return { target: byPoint, score: best.score, strategy: 'point-low-score' };
  return best;
}

function getEventPoint(target: Element, fallbackX: number, fallbackY: number): { x: number; y: number } {
  const rect = target.getBoundingClientRect();
  const withinTarget =
    fallbackX >= rect.left &&
    fallbackX <= rect.right &&
    fallbackY >= rect.top &&
    fallbackY <= rect.bottom;

  if (withinTarget || rect.width <= 0 || rect.height <= 0) {
    return { x: fallbackX, y: fallbackY };
  }

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function isDisabledTarget(target: Element): boolean {
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return target.disabled;
  }
  return target.getAttribute('aria-disabled') === 'true';
}

function isTransientFocusTarget(target: Element): boolean {
  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return true;
  if (target instanceof HTMLInputElement) {
    return ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(target.type);
  }
  return false;
}

function blurActiveTransientTarget(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTransientFocusTarget(active)) {
    active.blur();
  }
}

function releaseRemoteButtonState(target: Element, point: { x: number; y: number }, msg: PointerMessage): void {
  if (!isTransientFocusTarget(target)) return;
  runWithRemoteFlag(() => {
    dispatchMouseEvent(target, 'mouseup', point.x, point.y, { ...msg, buttons: 0 });
    dispatchMouseEvent(target, 'mouseout', point.x, point.y, { ...msg, buttons: 0 });
    dispatchMouseEvent(target, 'mouseleave', point.x, point.y, { ...msg, buttons: 0 });
    if (target instanceof HTMLElement) target.blur();
    blurActiveTransientTarget();
  });
}

function schedulePostClickRelease(target: Element, point: { x: number; y: number }, msg: PointerMessage): void {
  window.setTimeout(() => releaseRemoteButtonState(target, point, msg), 300);
  window.setTimeout(() => releaseRemoteButtonState(target, point, msg), 900);
}

function dispatchMouseEvent(
  target: Element,
  type: string,
  x: number,
  y: number,
  msg: PointerMessage
): void {
  const init: MouseEventInit = {
    bubbles: type !== 'mouseleave',
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

function runWithRemoteFlag(action: () => void): void {
  const windowRecord = window as unknown as Record<string, unknown>;
  const previousFlag = windowRecord[REMOTE_EVENT_FLAG];
  windowRecord[REMOTE_EVENT_FLAG] = true;
  applyingRemoteEvent = true;
  try {
    action();
  } finally {
    applyingRemoteEvent = false;
    if (previousFlag === undefined) {
      delete windowRecord[REMOTE_EVENT_FLAG];
    } else {
      windowRecord[REMOTE_EVENT_FLAG] = previousFlag;
    }
  }
}

function dispatchPointerMessage(target: Element, eventType: string, point: { x: number; y: number }, msg: PointerMessage): void {
  if (msg.type === 'MOUSE_DOWN') {
    blurActiveTransientTarget();
  }

  if (msg.type === 'MOUSE_CLICK' && target instanceof HTMLElement) {
    runWithRemoteFlag(() => {
      target.click();
    });
    schedulePostClickRelease(target, point, msg);
    return;
  }
  dispatchMouseEvent(target, eventType, point.x, point.y, msg);
}

function scheduleClickRetry(msg: PointerMessage): void {
  const eventType = eventTypeMap[msg.type];
  if (!eventType) return;

  let attempts = 0;
  const maxAttempts = 16;
  const retryDelayMs = 50;

  const retry = () => {
    attempts += 1;
    const x = msg.xRatio * window.innerWidth;
    const y = msg.yRatio * window.innerHeight;
    const result = findTarget(msg, x, y);

    if (result && !isDisabledTarget(result.target)) {
      const point = getEventPoint(result.target, x, y);
      dispatchPointerMessage(result.target, eventType, point, msg);
      return;
    }

    if (attempts < maxAttempts) {
      window.setTimeout(retry, retryDelayMs);
    }
  };

  window.setTimeout(retry, retryDelayMs);
}

export function applyClickEvent(msg: PointerMessage): string {
  if (applyingRemoteEvent) return 'skipped: already applying remote event';

  const x = msg.xRatio * window.innerWidth;
  const y = msg.yRatio * window.innerHeight;

  const result = findTarget(msg, x, y);
  if (!result) {
    if (msg.type === 'MOUSE_CLICK' && msg.target) {
      scheduleClickRetry(msg);
      return 'scheduled retry: target not found';
    }
    return 'target not found';
  }
  const target = result.target;
  const point = getEventPoint(target, x, y);

  const eventType = eventTypeMap[msg.type];
  if (!eventType) return `unsupported event type ${msg.type}`;

  if (msg.type === 'MOUSE_CLICK' && isDisabledTarget(target)) {
    scheduleClickRetry(msg);
    return `scheduled retry: target disabled target=${describeElement(target)} strategy=${result.strategy} score=${result.score.toFixed(1)}`;
  }

  // Show ripple for click/dblclick events
  if (msg.type === 'MOUSE_CLICK' || msg.type === 'MOUSE_DBLCLICK') {
    showRipple(msg.xRatio, msg.yRatio);
  }

  dispatchPointerMessage(target, eventType, point, msg);
  return `applied target=${describeElement(target)} strategy=${result.strategy} score=${result.score.toFixed(1)}`;
}

const eventTypeMap: Partial<Record<PointerMessage['type'], string>> = {
  MOUSE_DOWN: 'mousedown',
  MOUSE_UP: 'mouseup',
  MOUSE_CLICK: 'click',
  MOUSE_DBLCLICK: 'dblclick',
  CONTEXT_MENU: 'contextmenu',
};
