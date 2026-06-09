// ─── Sync Direction ─────────────────────────────────────────────────────────
export type SyncDirection = 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';

// ─── Sync Mode ───────────────────────────────────────────────────────────────
export type SyncMode = 'review' | 'replay';

// ─── Tab Pair ────────────────────────────────────────────────────────────────
export interface TabPair {
  tabAId: number | null;
  tabBId: number | null;
  tabAUrl: string;
  tabBUrl: string;
  tabATitle: string;
  tabBTitle: string;
}

// ─── Sync State ──────────────────────────────────────────────────────────────
export interface SyncState {
  enabled: boolean;
  direction: SyncDirection;
  mode: SyncMode;
  pair: TabPair;
}

// ─── Grid Settings ───────────────────────────────────────────────────────────
export interface GridSettings {
  visible: boolean;
  size: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
  color: string;
}

// ─── Compare Overlay Settings ────────────────────────────────────────────────
export interface CompareOverlaySettings {
  visible: boolean;
  opacity: number;
  direction: 'A_TO_B' | 'B_TO_A';
  imageDataUrl: string | null;
}

// ─── Blink Compare Settings ──────────────────────────────────────────────────
export interface BlinkSettings {
  enabled: boolean;
  interval: number;
}

// ─── Extension Storage ───────────────────────────────────────────────────────
export interface ExtensionStorage {
  syncState: SyncState;
  grid: GridSettings;
  compareOverlay: CompareOverlaySettings;
  blink: BlinkSettings;
}

// ─── Message Types ───────────────────────────────────────────────────────────
export type MessageType =
  | 'MOUSE_MOVE'
  | 'MOUSE_DOWN'
  | 'MOUSE_UP'
  | 'MOUSE_CLICK'
  | 'MOUSE_DBLCLICK'
  | 'CONTEXT_MENU'
  | 'WHEEL'
  | 'WINDOW_SCROLL'
  | 'DRAG_START'
  | 'DRAG_MOVE'
  | 'DRAG_END'
  | 'SHOW_GRID'
  | 'HIDE_GRID'
  | 'UPDATE_GRID'
  | 'SHOW_COMPARE_OVERLAY'
  | 'HIDE_COMPARE_OVERLAY'
  | 'SET_COMPARE_IMAGE'
  | 'START_BLINK'
  | 'STOP_BLINK'
  | 'SYNC_STATE_CHANGED'
  | 'CAPTURE_TAB';

// ─── Base Message ────────────────────────────────────────────────────────────
export interface BaseMessage {
  type: MessageType;
  sourceTabId?: number;
}

// ─── Pointer Messages ────────────────────────────────────────────────────────
export interface PointerMessage extends BaseMessage {
  type: 'MOUSE_MOVE' | 'MOUSE_DOWN' | 'MOUSE_UP' | 'MOUSE_CLICK' | 'MOUSE_DBLCLICK' | 'CONTEXT_MENU';
  xRatio: number;
  yRatio: number;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

// ─── Wheel Message ───────────────────────────────────────────────────────────
export interface WheelMessage extends BaseMessage {
  type: 'WHEEL';
  xRatio: number;
  yRatio: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

// ─── Scroll Message ──────────────────────────────────────────────────────────
export interface ScrollMessage extends BaseMessage {
  type: 'WINDOW_SCROLL';
  scrollXRatio: number;
  scrollYRatio: number;
}

// ─── Drag Messages ───────────────────────────────────────────────────────────
export interface DragMessage extends BaseMessage {
  type: 'DRAG_START' | 'DRAG_MOVE' | 'DRAG_END';
  xRatio: number;
  yRatio: number;
  button: number;
  buttons: number;
}

// ─── Grid Message ────────────────────────────────────────────────────────────
export interface GridMessage extends BaseMessage {
  type: 'SHOW_GRID' | 'HIDE_GRID' | 'UPDATE_GRID';
  settings?: GridSettings;
}

// ─── Compare Overlay Message ─────────────────────────────────────────────────
export interface CompareOverlayMessage extends BaseMessage {
  type: 'SHOW_COMPARE_OVERLAY' | 'HIDE_COMPARE_OVERLAY' | 'SET_COMPARE_IMAGE';
  imageDataUrl?: string;
  opacity?: number;
}

// ─── Blink Message ───────────────────────────────────────────────────────────
export interface BlinkMessage extends BaseMessage {
  type: 'START_BLINK' | 'STOP_BLINK';
  interval?: number;
  imageDataUrl?: string;
}

// ─── Sync State Changed Message ──────────────────────────────────────────────
export interface SyncStateChangedMessage extends BaseMessage {
  type: 'SYNC_STATE_CHANGED';
  state: SyncState;
}

// ─── Capture Tab Message ─────────────────────────────────────────────────────
export interface CaptureTabMessage extends BaseMessage {
  type: 'CAPTURE_TAB';
  targetTabId: number;
  overlayDirection: 'A_TO_B' | 'B_TO_A';
  opacity: number;
}

// ─── Union ───────────────────────────────────────────────────────────────────
export type ExtensionMessage =
  | PointerMessage
  | WheelMessage
  | ScrollMessage
  | DragMessage
  | GridMessage
  | CompareOverlayMessage
  | BlinkMessage
  | SyncStateChangedMessage
  | CaptureTabMessage;
