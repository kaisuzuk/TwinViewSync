/**
 * clickRipple.ts – Ripple animation shown at click positions.
 */

import { RIPPLE_CONTAINER_ID, Z_INDEX_RIPPLE } from '../shared/constants';

function ensureContainer(): HTMLDivElement {
  let container = document.getElementById(RIPPLE_CONTAINER_ID) as HTMLDivElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = RIPPLE_CONTAINER_ID;
    Object.assign(container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: String(Z_INDEX_RIPPLE),
      overflow: 'hidden',
    });
    document.documentElement.appendChild(container);

    // Inject keyframe animation once
    if (!document.getElementById('twin-view-sync-ripple-style')) {
      const style = document.createElement('style');
      style.id = 'twin-view-sync-ripple-style';
      style.textContent = `
        @keyframes tvsRipple {
          0%   { transform: translate(-50%, -50%) scale(0); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }
        .tvs-ripple {
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 3px solid rgba(255, 80, 80, 0.9);
          background: transparent;
          animation: tvsRipple 0.5s ease-out forwards;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }
  }
  return container;
}

export function showRipple(xRatio: number, yRatio: number): void {
  const container = ensureContainer();
  const x = xRatio * window.innerWidth;
  const y = yRatio * window.innerHeight;

  const ripple = document.createElement('div');
  ripple.className = 'tvs-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  container.appendChild(ripple);

  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}
