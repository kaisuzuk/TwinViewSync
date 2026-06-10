import type { ExtensionStorage, GridSettings, CompareOverlaySettings, BlinkSettings, SyncState } from './types';

export const STORAGE_KEY = 'twinViewSync';
export const DEBUG_LOG_KEY = 'twinViewSyncDebugLogs';
export const DEBUG_LOG_LIMIT = 200;

export const DEFAULT_GRID: GridSettings = {
  visible: false,
  size: 8,
  opacity: 0.3,
  offsetX: 0,
  offsetY: 0,
  color: '#0080ff',
};

export const DEFAULT_COMPARE_OVERLAY: CompareOverlaySettings = {
  visible: false,
  opacity: 0.5,
  direction: 'A_TO_B',
  imageDataUrl: null,
};

export const DEFAULT_BLINK: BlinkSettings = {
  enabled: false,
  interval: 500,
};

export const DEFAULT_SYNC_STATE: SyncState = {
  enabled: false,
  direction: 'A_TO_B',
  mode: 'review',
  pair: {
    tabAId: null,
    tabBId: null,
    tabAUrl: '',
    tabBUrl: '',
    tabATitle: '',
    tabBTitle: '',
  },
};

export const DEFAULT_STORAGE: ExtensionStorage = {
  syncState: DEFAULT_SYNC_STATE,
  grid: DEFAULT_GRID,
  compareOverlay: DEFAULT_COMPARE_OVERLAY,
  blink: DEFAULT_BLINK,
};

// Overlay element IDs
export const GHOST_CURSOR_ID = 'twin-view-sync-ghost-cursor';
export const GRID_OVERLAY_ID = 'twin-view-sync-grid-overlay';
export const COMPARE_OVERLAY_ID = 'twin-view-sync-compare-overlay';
export const RIPPLE_CONTAINER_ID = 'twin-view-sync-ripple-container';

// Z-index layers
export const Z_INDEX_GRID = 2147483645;
export const Z_INDEX_COMPARE = 2147483646;
export const Z_INDEX_CURSOR = 2147483647;
export const Z_INDEX_RIPPLE = 2147483647;

// Loop prevention flag attribute
export const REMOTE_EVENT_FLAG = '__twinViewSyncRemote';
