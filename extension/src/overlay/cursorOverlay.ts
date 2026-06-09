/**
 * cursorOverlay.ts – Ghost cursor that mirrors the remote pointer position.
 */

import { GHOST_CURSOR_ID, Z_INDEX_CURSOR } from '../shared/constants';

let cursorEl: HTMLDivElement | null = null;

export function initCursorOverlay(): void {
  if (document.getElementById(GHOST_CURSOR_ID)) return;

  cursorEl = document.createElement('div');
  cursorEl.id = GHOST_CURSOR_ID;
  Object.assign(cursorEl.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 80, 80, 0.9)',
    backgroundColor: 'rgba(255, 80, 80, 0.25)',
    pointerEvents: 'none',
    zIndex: String(Z_INDEX_CURSOR),
    transform: 'translate(-50%, -50%)',
    transition: 'top 0.04s linear, left 0.04s linear',
    display: 'none',
  });

  document.documentElement.appendChild(cursorEl);
}

export function moveCursor(xRatio: number, yRatio: number): void {
  if (!cursorEl) initCursorOverlay();
  if (!cursorEl) return;

  const x = xRatio * window.innerWidth;
  const y = yRatio * window.innerHeight;

  cursorEl.style.left = `${x}px`;
  cursorEl.style.top = `${y}px`;
  cursorEl.style.display = 'block';
}

export function hideCursor(): void {
  if (cursorEl) cursorEl.style.display = 'none';
}

export function removeCursorOverlay(): void {
  cursorEl?.remove();
  cursorEl = null;
}
