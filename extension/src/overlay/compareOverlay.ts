/**
 * compareOverlay.ts – Semitransparent screenshot overlay for visual diffing.
 */

import { COMPARE_OVERLAY_ID, Z_INDEX_COMPARE } from '../shared/constants';

let overlayEl: HTMLImageElement | null = null;
let blinkTimer: ReturnType<typeof setInterval> | null = null;
let blinkVisible = true;
let lastImageUrl: string | null = null;

function ensureOverlay(): HTMLImageElement {
  let el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
  if (!el) {
    el = document.createElement('img');
    el.id = COMPARE_OVERLAY_ID;
    Object.assign(el.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      objectFit: 'cover',
      pointerEvents: 'none',
      zIndex: String(Z_INDEX_COMPARE),
      display: 'none',
    });
    document.documentElement.appendChild(el);
    overlayEl = el;
  }
  overlayEl = el;
  return el;
}

export function setCompareImage(imageDataUrl: string, opacity: number): void {
  lastImageUrl = imageDataUrl;
  const el = ensureOverlay();
  el.src = imageDataUrl;
  el.style.opacity = String(opacity);
  el.style.display = 'block';
}

export function showCompareOverlay(opacity?: number): void {
  const el = ensureOverlay();
  if (lastImageUrl) el.src = lastImageUrl;
  if (opacity !== undefined) el.style.opacity = String(opacity);
  el.style.display = 'block';
}

export function hideCompareOverlay(): void {
  const el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
  if (el) el.style.display = 'none';
}

export function updateOverlayOpacity(opacity: number): void {
  const el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
  if (el) el.style.opacity = String(opacity);
}

export function removeCompareOverlay(): void {
  stopBlink();
  overlayEl?.remove();
  overlayEl = null;
  lastImageUrl = null;
}

// ─── Blink Compare ────────────────────────────────────────────────────────────

export function startBlink(interval: number, imageDataUrl?: string): void {
  stopBlink();

  if (imageDataUrl) {
    lastImageUrl = imageDataUrl;
    const el = ensureOverlay();
    el.src = imageDataUrl;
  }

  blinkVisible = false;

  blinkTimer = setInterval(() => {
    const el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
    if (!el) return;

    blinkVisible = !blinkVisible;

    if (blinkVisible) {
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }, interval);
}

export function stopBlink(): void {
  if (blinkTimer !== null) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }
  // Restore overlay to normal visible state if it has an image
  const el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
  if (el && lastImageUrl) {
    el.style.display = 'block';
  }
}
