/**
 * scrollSync.ts – Captures window scroll events and forwards them.
 * Also applies received scroll messages.
 */

import type { ScrollMessage, TargetHint } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;
let applyingRemoteScroll = false;
let remoteScrollToken = 0;

type ScrollAxis = 'x' | 'y' | 'both';

interface TargetSearchResult {
  target: HTMLElement;
  score: number;
  strategy: string;
  candidates: number;
  index: number;
}

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

function elementClassName(el: Element): string {
  return typeof el.className === 'string' ? el.className : '';
}

function classOverlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const aClasses = new Set(a.split(/\s+/).filter(Boolean));
  const bClasses = b.split(/\s+/).filter(Boolean);
  return bClasses.reduce((score, className) => score + (aClasses.has(className) ? 1 : 0), 0);
}

function classCount(className: string): number {
  return className.split(/\s+/).filter(Boolean).length;
}

function describeElement(el: HTMLElement): string {
  const id = el.id ? `#${el.id}` : '';
  const rawClassName = elementClassName(el);
  const className = rawClassName
    ? `.${rawClassName.trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  return `${el.tagName}${id}${className}`;
}

function getComposedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function getScrollableAncestor(el: Element | null): HTMLElement | null {
  let current: Element | null = el;
  while (current) {
    if (isElementScrollTarget(current)) return current;
    current = getComposedParent(current);
  }
  return null;
}

function collectElementsDeep(root: ParentNode): HTMLElement[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('*'));
  const withShadowDescendants: HTMLElement[] = [];

  for (const el of elements) {
    withShadowDescendants.push(el);
    if (el.shadowRoot) {
      withShadowDescendants.push(...collectElementsDeep(el.shadowRoot));
    }
  }

  return withShadowDescendants;
}

function getScrollableElements(): HTMLElement[] {
  const root = document.body ?? document.documentElement;
  if (!root) return [];
  return collectElementsDeep(root)
    .filter(isVisibleScrollTarget);
}

function getScrollableIndex(target: HTMLElement): number {
  return getScrollableElements().indexOf(target);
}

function getScrollAxis(target: HTMLElement): ScrollAxis | null {
  const style = window.getComputedStyle(target);
  const canScrollX = isScrollableOverflow(style.overflowX);
  const canScrollY = isScrollableOverflow(style.overflowY);
  const hasX = target.scrollWidth - target.clientWidth > 1 && canScrollX;
  const hasY = target.scrollHeight - target.clientHeight > 1 && canScrollY;
  if (hasX && hasY) return 'both';
  if (hasX) return 'x';
  if (hasY) return 'y';
  return null;
}

function isScrollableOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

function axisMatches(candidateAxis: ScrollAxis | null, sourceAxis?: ScrollAxis): boolean {
  if (!sourceAxis || !candidateAxis) return true;
  return candidateAxis === sourceAxis || candidateAxis === 'both' || sourceAxis === 'both';
}

function rectRatioScore(el: HTMLElement, hint: TargetHint): number {
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

  return Math.max(0, 70 - delta * 70);
}

function scoreCandidate(
  el: HTMLElement,
  hint: TargetHint,
  pointX: number,
  pointY: number,
  candidateIndex: number,
  scrollableIndex?: number,
  scrollAxis?: ScrollAxis,
  hitByPoint = false
): number {
  const rect = el.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const distance = Math.hypot(centerX - pointX, centerY - pointY);
  const maxDistance = Math.hypot(window.innerWidth, window.innerHeight) || 1;

  let score = 0;
  if (hint.id && el.id === hint.id) score += 100;
  if (hitByPoint) score += 45;
  if (scrollableIndex !== undefined && candidateIndex >= 0) {
    score += Math.max(0, 45 - Math.abs(candidateIndex - scrollableIndex) * 8);
  }
  if (axisMatches(getScrollAxis(el), scrollAxis)) {
    score += 35;
  } else {
    score -= 40;
  }
  score += rectRatioScore(el, hint);
  if (targetMatches(el, hint)) score += 25;
  if (el.tagName === hint.tagName) score += 20;
  if (hint.ariaLabel && (el.getAttribute('aria-label') ?? '') === hint.ariaLabel) score += 25;
  const elClassName = elementClassName(el);
  if (hint.className && elClassName === hint.className) score += 80;
  const overlap = classOverlapScore(elClassName, hint.className);
  const hintClassCount = Math.max(1, classCount(hint.className));
  score += Math.min(70, overlap * 18 + (overlap / hintClassCount) * 30);
  score += Math.max(0, 30 - (distance / maxDistance) * 30);
  return score;
}

function findTargets(
  hint: TargetHint,
  scrollableIndex?: number,
  scrollAxis?: ScrollAxis
): TargetSearchResult[] {
  const pointX = hint.xRatio * window.innerWidth;
  const pointY = hint.yRatio * window.innerHeight;
  const scrollables = getScrollableElements();
  const candidates = [...scrollables];
  const totalCandidates = candidates.length;
  const ranked: TargetSearchResult[] = [];

  if (hint.id) {
    const byId = document.getElementById(hint.id);
    if (byId && isElementScrollTarget(byId)) {
      const index = scrollables.indexOf(byId);
      ranked.push({
        target: byId,
        score: 999,
        strategy: 'id',
        candidates: totalCandidates,
        index,
      });
    }
  }

  const byPoint = getScrollableAncestor(document.elementFromPoint(pointX, pointY));
  if (byPoint && !candidates.includes(byPoint)) candidates.push(byPoint);

  const scored = candidates
    .map((el) => {
      const index = scrollables.indexOf(el);
      return {
        target: el,
        index,
        candidates: candidates.length,
        strategy: byPoint === el ? 'scored+point' : 'scored',
        score: scoreCandidate(
          el,
          hint,
          pointX,
          pointY,
          index,
          scrollableIndex,
          scrollAxis,
          byPoint === el
        ),
      };
    })
    .sort((a, b) => b.score - a.score);

  const seen = new Set<HTMLElement>();
  return [...ranked, ...scored]
    .filter((item) => {
      if (seen.has(item.target)) return false;
      seen.add(item.target);
      return true;
    });
}

function isElementScrollTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.documentElement || target === document.body) return false;
  return getScrollAxis(target) !== null;
}

function isVisibleScrollTarget(target: EventTarget | null): target is HTMLElement {
  if (!isElementScrollTarget(target)) return false;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(target);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function markApplyingRemoteScroll(): void {
  const token = ++remoteScrollToken;
  applyingRemoteScroll = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token === remoteScrollToken) applyingRemoteScroll = false;
    });
  });
  window.setTimeout(() => {
    if (token === remoteScrollToken) applyingRemoteScroll = false;
  }, 160);
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
  const scrollAxis = maxScrollX > 0 && maxScrollY > 0
    ? 'both'
    : maxScrollX > 0 ? 'x' : 'y';

  const msg: ScrollMessage = {
    type: 'WINDOW_SCROLL',
    targetKind: 'element',
    target: buildTargetHint(e.target),
    scrollXRatio: maxScrollX > 0 ? e.target.scrollLeft / maxScrollX : 0,
    scrollYRatio: maxScrollY > 0 ? e.target.scrollTop / maxScrollY : 0,
    scrollableIndex: getScrollableIndex(e.target),
    scrollAxis,
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
    const searches = findTargets(msg.target, msg.scrollableIndex, msg.scrollAxis);
    if (searches.length === 0) return 'element target not found';

    const attempts: string[] = [];
    for (const search of searches) {
      const target = search.target;
      const maxScrollX = target.scrollWidth - target.clientWidth;
      const maxScrollY = target.scrollHeight - target.clientHeight;
      if (maxScrollX <= 0 && maxScrollY <= 0) {
        attempts.push(`${describeElement(target)} not-scrollable`);
        continue;
      }

      const left = msg.scrollXRatio * Math.max(0, maxScrollX);
      const top = msg.scrollYRatio * Math.max(0, maxScrollY);
      const beforeLeft = target.scrollLeft;
      const beforeTop = target.scrollTop;

      markApplyingRemoteScroll();
      target.scrollLeft = left;
      target.scrollTop = top;

      const leftChanged = Math.abs(target.scrollLeft - beforeLeft) > 0.5;
      const topChanged = Math.abs(target.scrollTop - beforeTop) > 0.5;
      const leftReached = Math.abs(target.scrollLeft - left) <= 1;
      const topReached = Math.abs(target.scrollTop - top) <= 1;
      const needsX = maxScrollX > 0 && Math.abs(left - beforeLeft) > 1;
      const needsY = maxScrollY > 0 && Math.abs(top - beforeTop) > 1;
      const applied = (!needsX || leftChanged || leftReached) && (!needsY || topChanged || topReached);
      const detail = `${describeElement(target)} strategy=${search.strategy} score=${search.score.toFixed(1)} idx=${search.index}/${search.candidates} left=${beforeLeft.toFixed(0)}->${target.scrollLeft.toFixed(0)}/${maxScrollX.toFixed(0)} top=${beforeTop.toFixed(0)}->${target.scrollTop.toFixed(0)}/${maxScrollY.toFixed(0)}`;

      if (applied) {
        return `element ${detail}`;
      }
      attempts.push(`${detail} no-move`);
    }

    return `element target did not move attempts=${attempts.slice(0, 3).join(' | ')}`;
  }

  const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
  const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;

  const x = msg.scrollXRatio * Math.max(0, maxScrollX);
  const y = msg.scrollYRatio * Math.max(0, maxScrollY);
  const beforeX = window.scrollX;
  const beforeY = window.scrollY;

  markApplyingRemoteScroll();

  // Mark the event so onScroll handler can detect it
  const marker = { [REMOTE_EVENT_FLAG]: true };
  Object.assign(window, marker);

  window.scrollTo({ left: x, top: y, behavior: 'instant' as ScrollBehavior });

  return `window left=${beforeX.toFixed(0)}->${window.scrollX.toFixed(0)}/${maxScrollX.toFixed(0)} top=${beforeY.toFixed(0)}->${window.scrollY.toFixed(0)}/${maxScrollY.toFixed(0)}`;
}
