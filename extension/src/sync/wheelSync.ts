/**
 * wheelSync.ts – Captures wheel events and forwards them to the background.
 */

import type { WheelMessage } from '../shared/types';
import { REMOTE_EVENT_FLAG } from '../shared/constants';
import { sendToBackground } from '../shared/messaging';

let active = false;

function onWheel(e: WheelEvent): void {
  if (!active || (e as unknown as Record<string, unknown>)[REMOTE_EVENT_FLAG]) return;
  const msg: WheelMessage = {
    type: 'WHEEL',
    xRatio: e.clientX / window.innerWidth,
    yRatio: e.clientY / window.innerHeight,
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaZ: e.deltaZ,
    deltaMode: e.deltaMode,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
  };
  sendToBackground(msg).catch(() => {/* ignore */});
}

export function startWheelSync(): void {
  if (active) return;
  active = true;
  window.addEventListener('wheel', onWheel, { passive: true, capture: true });
}

export function stopWheelSync(): void {
  active = false;
  window.removeEventListener('wheel', onWheel, { capture: true });
}
