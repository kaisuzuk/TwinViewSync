/**
 * compareOverlay.ts – Semitransparent screenshot overlay for visual diffing.
 */

import { COMPARE_OVERLAY_ID, Z_INDEX_COMPARE } from '../shared/constants';

let overlayEl: HTMLImageElement | null = null;
let blinkTimer: ReturnType<typeof setInterval> | null = null;
let blinkVisible = true;
let lastImageUrl: string | null = null;

function setImportantStyle(el: HTMLElement, property: string, value: string): void {
  el.style.setProperty(property, value, 'important');
}

function applyOverlayStyles(el: HTMLImageElement): void {
  setImportantStyle(el, 'position', 'fixed');
  setImportantStyle(el, 'inset', '0');
  setImportantStyle(el, 'top', '0');
  setImportantStyle(el, 'left', '0');
  setImportantStyle(el, 'width', '100vw');
  setImportantStyle(el, 'height', '100vh');
  setImportantStyle(el, 'max-width', 'none');
  setImportantStyle(el, 'max-height', 'none');
  setImportantStyle(el, 'min-width', '0');
  setImportantStyle(el, 'min-height', '0');
  setImportantStyle(el, 'object-fit', 'cover');
  setImportantStyle(el, 'pointer-events', 'none');
  setImportantStyle(el, 'z-index', String(Z_INDEX_COMPARE));
  setImportantStyle(el, 'margin', '0');
  setImportantStyle(el, 'padding', '0');
  setImportantStyle(el, 'border', '0');
  setImportantStyle(el, 'transform', 'none');
}

function ensureOverlay(): HTMLImageElement {
  let el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
  if (!el) {
    el = document.createElement('img');
    el.id = COMPARE_OVERLAY_ID;
    applyOverlayStyles(el);
    setImportantStyle(el, 'display', 'none');
    document.documentElement.appendChild(el);
    overlayEl = el;
  }
  applyOverlayStyles(el);
  overlayEl = el;
  return el;
}

export function setCompareImage(imageDataUrl: string, opacity: number): void {
  lastImageUrl = imageDataUrl;
  const el = ensureOverlay();
  el.src = imageDataUrl;
  setImportantStyle(el, 'opacity', String(opacity));
  setImportantStyle(el, 'display', 'block');
}

export function showCompareOverlay(opacity?: number, imageDataUrl?: string): void {
  if (imageDataUrl) {
    lastImageUrl = imageDataUrl;
  }

  const el = ensureOverlay();
  if (lastImageUrl) el.src = lastImageUrl;
  if (opacity !== undefined) setImportantStyle(el, 'opacity', String(opacity));
  setImportantStyle(el, 'display', 'block');
}

export function hideCompareOverlay(): void {
  const el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
  if (el) setImportantStyle(el, 'display', 'none');
}

export function updateOverlayOpacity(opacity: number): void {
  const el = document.getElementById(COMPARE_OVERLAY_ID) as HTMLImageElement | null;
  if (el) setImportantStyle(el, 'opacity', String(opacity));
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
      setImportantStyle(el, 'display', 'block');
    } else {
      setImportantStyle(el, 'display', 'none');
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
    setImportantStyle(el, 'display', 'block');
  }
}
