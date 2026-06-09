/**
 * gridOverlay.ts – Pixel grid overlay for layout verification.
 */

import type { GridSettings } from '../shared/types';
import { GRID_OVERLAY_ID, Z_INDEX_GRID } from '../shared/constants';

let canvas: HTMLCanvasElement | null = null;

function buildCanvas(): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.id = GRID_OVERLAY_ID;
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: String(Z_INDEX_GRID),
  });
  document.documentElement.appendChild(el);
  return el;
}

function drawGrid(settings: GridSettings): void {
  if (!canvas) return;

  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = settings.color;
  ctx.globalAlpha = settings.opacity;
  ctx.lineWidth = 0.5;

  const { size, offsetX, offsetY } = settings;

  for (let x = offsetX % size; x < W; x += size) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  for (let y = offsetY % size; y < H; y += size) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

export function showGrid(settings: GridSettings): void {
  if (!canvas) {
    canvas = buildCanvas();
  }
  drawGrid(settings);
  canvas.style.display = 'block';
}

export function updateGrid(settings: GridSettings): void {
  if (!canvas) {
    canvas = buildCanvas();
  }
  if (settings.visible) {
    drawGrid(settings);
    canvas.style.display = 'block';
  } else {
    canvas.style.display = 'none';
  }
}

export function hideGrid(): void {
  if (canvas) canvas.style.display = 'none';
}

export function removeGrid(): void {
  canvas?.remove();
  canvas = null;
}

// Redraw on resize to keep grid aligned
window.addEventListener('resize', () => {
  // Grid will be redrawn by the popup on next interaction; no-op here.
});
