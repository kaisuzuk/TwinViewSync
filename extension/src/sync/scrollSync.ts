/**
 * scrollSync.ts – Captures window scroll events and forwards them.
 * Also applies received scroll messages.
 */

import type { ScrollMessage } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;
let applyingRemoteScroll = false;

function onScroll(): void {
  if (!active || applyingRemoteScroll) return;

  const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
  const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;

  const msg: ScrollMessage = {
    type: 'WINDOW_SCROLL',
    scrollXRatio: maxScrollX > 0 ? window.scrollX / maxScrollX : 0,
    scrollYRatio: maxScrollY > 0 ? window.scrollY / maxScrollY : 0,
  };
  sendToBackground(msg).catch(() => {/* ignore */});
}

export function startScrollSync(): void {
  if (active) return;
  active = true;
  window.addEventListener('scroll', onScroll, { passive: true });
}

export function stopScrollSync(): void {
  active = false;
  window.removeEventListener('scroll', onScroll);
}

export function applyScrollEvent(msg: ScrollMessage): void {
  const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
  const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;

  const x = msg.scrollXRatio * Math.max(0, maxScrollX);
  const y = msg.scrollYRatio * Math.max(0, maxScrollY);

  applyingRemoteScroll = true;

  // Mark the event so onScroll handler can detect it
  const marker = { [REMOTE_EVENT_FLAG]: true };
  Object.assign(window, marker);

  window.scrollTo({ left: x, top: y, behavior: 'instant' as ScrollBehavior });

  // Use rAF to clear the flag after scroll settles
  requestAnimationFrame(() => {
    applyingRemoteScroll = false;
  });
}
