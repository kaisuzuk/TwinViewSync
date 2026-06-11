/**
 * diffHighlightOverlay.ts - Pixel diff mask overlay for visible viewport captures.
 */

import { DIFF_HIGHLIGHT_ID, Z_INDEX_DIFF } from '../shared/constants';

let diffCanvas: HTMLCanvasElement | null = null;
let lastReferenceImageUrl: string | null = null;
let lastTargetImageUrl: string | null = null;
let lastOpacity = 0.75;
let lastThreshold = 32;

function setImportantStyle(el: HTMLElement, property: string, value: string): void {
  el.style.setProperty(property, value, 'important');
}

function applyCanvasStyles(el: HTMLCanvasElement): void {
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
  setImportantStyle(el, 'pointer-events', 'none');
  setImportantStyle(el, 'z-index', String(Z_INDEX_DIFF));
  setImportantStyle(el, 'margin', '0');
  setImportantStyle(el, 'padding', '0');
  setImportantStyle(el, 'border', '0');
  setImportantStyle(el, 'transform', 'none');
  setImportantStyle(el, 'mix-blend-mode', 'normal');
}

function ensureDiffCanvas(): HTMLCanvasElement {
  let el = document.getElementById(DIFF_HIGHLIGHT_ID) as HTMLCanvasElement | null;
  if (!el) {
    el = document.createElement('canvas');
    el.id = DIFF_HIGHLIGHT_ID;
    applyCanvasStyles(el);
    setImportantStyle(el, 'display', 'none');
    document.documentElement.appendChild(el);
  }
  applyCanvasStyles(el);
  diffCanvas = el;
  return el;
}

function setDiffCanvasVisible(visible: boolean): void {
  const el = ensureDiffCanvas();
  setImportantStyle(el, 'display', visible ? 'block' : 'none');
}

function loadImage(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for diff highlight.'));
    img.src = imageDataUrl;
  });
}

function drawNormalizedImage(
  img: HTMLImageElement,
  width: number,
  height: number
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create diff canvas context.');

  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function clampThreshold(threshold: number): number {
  return Math.max(0, Math.min(255, Math.round(threshold)));
}

async function renderDiffMask(): Promise<void> {
  if (!lastReferenceImageUrl || !lastTargetImageUrl) return;

  const el = ensureDiffCanvas();
  const rect = document.documentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(window.innerWidth * dpr || rect.width * dpr));
  const height = Math.max(1, Math.round(window.innerHeight * dpr || rect.height * dpr));

  el.width = width;
  el.height = height;

  const ctx = el.getContext('2d');
  if (!ctx) return;

  const [referenceImg, targetImg] = await Promise.all([
    loadImage(lastReferenceImageUrl),
    loadImage(lastTargetImageUrl),
  ]);
  const referenceData = drawNormalizedImage(referenceImg, width, height);
  const targetData = drawNormalizedImage(targetImg, width, height);
  const output = ctx.createImageData(width, height);
  const threshold = clampThreshold(lastThreshold);

  for (let i = 0; i < referenceData.data.length; i += 4) {
    const redDelta = Math.abs(referenceData.data[i] - targetData.data[i]);
    const greenDelta = Math.abs(referenceData.data[i + 1] - targetData.data[i + 1]);
    const blueDelta = Math.abs(referenceData.data[i + 2] - targetData.data[i + 2]);
    const delta = Math.max(redDelta, greenDelta, blueDelta);

    if (delta >= threshold) {
      output.data[i] = 255;
      output.data[i + 1] = 36;
      output.data[i + 2] = 36;
      output.data[i + 3] = Math.round(Math.min(1, Math.max(0, lastOpacity)) * 255);
    }
  }

  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(output, 0, 0);
}

export function setDiffHighlightImages(
  referenceImageDataUrl: string,
  targetImageDataUrl: string,
  opacity: number,
  threshold: number,
  visible = true
): void {
  lastReferenceImageUrl = referenceImageDataUrl;
  lastTargetImageUrl = targetImageDataUrl;
  lastOpacity = opacity;
  lastThreshold = threshold;
  renderDiffMask()
    .then(() => {
      setDiffCanvasVisible(visible);
    })
    .catch(() => hideDiffHighlight());
}

export function showDiffHighlight(
  opacity?: number,
  threshold?: number,
  referenceImageDataUrl?: string,
  targetImageDataUrl?: string
): void {
  if (referenceImageDataUrl) lastReferenceImageUrl = referenceImageDataUrl;
  if (targetImageDataUrl) lastTargetImageUrl = targetImageDataUrl;
  if (opacity !== undefined) lastOpacity = opacity;
  if (threshold !== undefined) lastThreshold = threshold;

  const el = ensureDiffCanvas();
  renderDiffMask().catch(() => hideDiffHighlight());
  setImportantStyle(el, 'display', 'block');
}

export function hideDiffHighlight(): void {
  const el = document.getElementById(DIFF_HIGHLIGHT_ID) as HTMLCanvasElement | null;
  if (el) setImportantStyle(el, 'display', 'none');
}

export function removeDiffHighlight(): void {
  diffCanvas?.remove();
  diffCanvas = null;
  lastReferenceImageUrl = null;
  lastTargetImageUrl = null;
}
