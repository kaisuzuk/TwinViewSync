/**
 * locationSync.ts - Mirrors SPA route changes between paired tabs.
 */

import type { LocationMessage } from '../shared/types';
import { sendToBackground } from '../shared/messaging';

let active = false;
let applyingRemoteLocation = false;
let lastHref = window.location.href;
let pollTimer: number | null = null;

function buildLocationMessage(): LocationMessage {
  return {
    type: 'LOCATION_CHANGE',
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    href: window.location.href,
  };
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function messagePath(msg: LocationMessage): string {
  return `${msg.pathname}${msg.search}${msg.hash}`;
}

function maybeSendLocationChange(): void {
  if (!active || applyingRemoteLocation) return;
  if (window.location.href === lastHref) return;

  lastHref = window.location.href;
  sendToBackground(buildLocationMessage()).catch(() => {/* ignore */});
}

function onLocationEvent(): void {
  window.setTimeout(maybeSendLocationChange, 0);
}

export function startLocationSync(): void {
  if (active) return;
  active = true;
  lastHref = window.location.href;
  window.addEventListener('popstate', onLocationEvent);
  window.addEventListener('hashchange', onLocationEvent);
  pollTimer = window.setInterval(maybeSendLocationChange, 250);
}

export function stopLocationSync(): void {
  active = false;
  window.removeEventListener('popstate', onLocationEvent);
  window.removeEventListener('hashchange', onLocationEvent);
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function applyLocationChange(msg: LocationMessage): string {
  const nextPath = messagePath(msg);
  if (currentPath() === nextPath) return `skipped: already at ${nextPath}`;

  const beforeHref = window.location.href;
  const beforeHash = window.location.hash;
  const targetUrl = new URL(nextPath, window.location.origin);
  applyingRemoteLocation = true;

  window.history.pushState(window.history.state, '', targetUrl);
  lastHref = window.location.href;
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));

  if (beforeHash !== targetUrl.hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange', {
      oldURL: beforeHref,
      newURL: window.location.href,
    }));
  }

  window.setTimeout(() => {
    applyingRemoteLocation = false;
  }, 100);

  return `applied ${beforeHref} -> ${window.location.href}`;
}
