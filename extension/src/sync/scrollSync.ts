/**
 * scrollSync.ts – Captures window scroll events and forwards them.
 * Also applies received scroll messages.
 */

import type { ScrollMessage, TargetHint } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;
let applyingRemoteScroll = false;

function getElementType(el: Element): string {
  return el instanceof HTMLInputElement ? el.type : '';
}

function buildTargetHint(target: Element): TargetHint {
  const rect = target.getBoundingClientRect();
  const x = rect.width > 0 ? rect.left + rect.width / 2 : 0;
  const y = rect.height > 0 ? rect.top + rect.height / 2 : 0;

  return {
    xRatio: window.innerWidth > 0 ? x / window.innerWidth : 0,
    yRatio: window.innerHeight > 0 ? y / window.innerHeight : 0,
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

function classOverlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const aClasses = new Set(a.split(/\s+/).filter(Boolean));
  const bClasses = b.split(/\s+/).filter(Boolean);
  return bClasses.reduce((score, className) => score + (aClasses.has(className) ? 1 : 0), 0);
}

function describeElement(el: HTMLElement): string {
  const id = el.id ? `#${el.id}` : '';
  const className = typeof el.className === 'string' && el.className
    ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  return `${el.tagName}${id}${className}`;
}

function getScrollableAncestor(el: Element | null): HTMLElement | null {
  let current: Element | null = el;
  while (current) {
    if (isElementScrollTarget(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function getScrollableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .filter(isElementScrollTarget);
}

function scoreCandidate(el: HTMLElement, hint: TargetHint, pointX: number, pointY: number): number {
  const rect = el.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const distance = Math.hypot(centerX - pointX, centerY - pointY);
  const maxDistance = Math.hypot(window.innerWidth, window.innerHeight) || 1;

  let score = 0;
  if (hint.id && el.id === hint.id) score += 100;
  if (el.tagName === hint.tagName) score += 30;
  if (hint.ariaLabel && (el.getAttribute('aria-label') ?? '') === hint.ariaLabel) score += 25;
  score += Math.min(30, classOverlapScore(typeof el.className === 'string' ? el.className : '', hint.className) * 10);
  score += Math.max(0, 30 - (distance / maxDistance) * 30);
  return score;
}

function findTarget(hint: TargetHint): HTMLElement | null {
  if (hint.id) {
    const byId = document.getElementById(hint.id);
    if (byId && isElementScrollTarget(byId)) return byId;
  }

  const pointX = hint.xRatio * window.innerWidth;
  const pointY = hint.yRatio * window.innerHeight;
  const byPoint = getScrollableAncestor(document.elementFromPoint(pointX, pointY));
  if (byPoint && targetMatches(byPoint, hint)) return byPoint;

  const candidates = getScrollableElements();
  if (candidates.length === 0) return byPoint;

  const best = candidates
    .map((el) => ({ el, score: scoreCandidate(el, hint, pointX, pointY) }))
    .sort((a, b) => b.score - a.score)[0];

  return best?.el ?? byPoint;
}

function isElementScrollTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.documentElement || target === document.body) return false;
  return target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth;
}

function onWindowScroll(): void {
  if (!active || applyingRemoteScroll) return;

  const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
  const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;

  const msg: ScrollMessage = {
    type: 'WINDOW_SCROLL',
    targetKind: 'window',
    scrollXRatio: maxScrollX > 0 ? window.scrollX / maxScrollX : 0,
    scrollYRatio: maxScrollY > 0 ? window.scrollY / maxScrollY : 0,
  };
  sendToBackground(msg).catch(() => {/* ignore */});
}

function onElementScroll(e: Event): void {
  if (!active || applyingRemoteScroll) return;
  if (!isElementScrollTarget(e.target)) return;

  const maxScrollX = e.target.scrollWidth - e.target.clientWidth;
  const maxScrollY = e.target.scrollHeight - e.target.clientHeight;

  const msg: ScrollMessage = {
    type: 'WINDOW_SCROLL',
    targetKind: 'element',
    target: buildTargetHint(e.target),
    scrollXRatio: maxScrollX > 0 ? e.target.scrollLeft / maxScrollX : 0,
    scrollYRatio: maxScrollY > 0 ? e.target.scrollTop / maxScrollY : 0,
  };
  sendToBackground(msg).catch(() => {/* ignore */});
}

export function startScrollSync(): void {
  if (active) return;
  active = true;
  window.addEventListener('scroll', onWindowScroll, { passive: true });
  document.addEventListener('scroll', onElementScroll, { passive: true, capture: true });
}

export function stopScrollSync(): void {
  active = false;
  window.removeEventListener('scroll', onWindowScroll);
  document.removeEventListener('scroll', onElementScroll, { capture: true });
}

export function applyScrollEvent(msg: ScrollMessage): string {
  if (msg.targetKind === 'element' && msg.target) {
    const target = findTarget(msg.target);
    if (!target) return 'element target not found';

    const maxScrollX = target.scrollWidth - target.clientWidth;
    const maxScrollY = target.scrollHeight - target.clientHeight;
    if (maxScrollX <= 0 && maxScrollY <= 0) {
      return `element target not scrollable target=${describeElement(target)}`;
    }

    const left = msg.scrollXRatio * Math.max(0, maxScrollX);
    const top = msg.scrollYRatio * Math.max(0, maxScrollY);
    const beforeLeft = target.scrollLeft;
    const beforeTop = target.scrollTop;

    applyingRemoteScroll = true;
    target.scrollTo({ left, top, behavior: 'instant' as ScrollBehavior });
    requestAnimationFrame(() => {
      applyingRemoteScroll = false;
    });
    return `element ${describeElement(target)} left=${beforeLeft.toFixed(0)}->${target.scrollLeft.toFixed(0)}/${maxScrollX.toFixed(0)} top=${beforeTop.toFixed(0)}->${target.scrollTop.toFixed(0)}/${maxScrollY.toFixed(0)}`;
  }

  const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
  const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;

  const x = msg.scrollXRatio * Math.max(0, maxScrollX);
  const y = msg.scrollYRatio * Math.max(0, maxScrollY);
  const beforeX = window.scrollX;
  const beforeY = window.scrollY;

  applyingRemoteScroll = true;

  // Mark the event so onScroll handler can detect it
  const marker = { [REMOTE_EVENT_FLAG]: true };
  Object.assign(window, marker);

  window.scrollTo({ left: x, top: y, behavior: 'instant' as ScrollBehavior });

  // Use rAF to clear the flag after scroll settles
  requestAnimationFrame(() => {
    applyingRemoteScroll = false;
  });
  return `window left=${beforeX.toFixed(0)}->${window.scrollX.toFixed(0)}/${maxScrollX.toFixed(0)} top=${beforeY.toFixed(0)}->${window.scrollY.toFixed(0)}/${maxScrollY.toFixed(0)}`;
}
