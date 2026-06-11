// ─── Sync Direction ─────────────────────────────────────────────────────────
export type SyncDirection = 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL';

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

// ─── Diff Highlight Settings ────────────────────────────────────────────────
export interface DiffHighlightSettings {
  visible: boolean;
  opacity: number;
  threshold: number;
  direction: 'A_TO_B' | 'B_TO_A';
  referenceImageDataUrl: string | null;
  targetImageDataUrl: string | null;
}

// ─── Extension Storage ───────────────────────────────────────────────────────
export interface ExtensionStorage {
  syncState: SyncState;
  grid: GridSettings;
  compareOverlay: CompareOverlaySettings;
  blink: BlinkSettings;
  diffHighlight: DiffHighlightSettings;
}

// ─── Diagnostics ────────────────────────────────────────────────────────────
export type DebugLogPhase = 'send' | 'relay' | 'apply' | 'state' | 'error';

export interface DebugLogEntry {
  id: string;
  ts: number;
  phase: DebugLogPhase;
  messageType: MessageType | 'SYSTEM';
  sourceTabId?: number;
  targetTabId?: number;
  detail: string;
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
  | 'LOCATION_CHANGE'
  | 'INPUT'
  | 'CHANGE'
  | 'KEY_DOWN'
  | 'KEY_UP'
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
  | 'SET_DIFF_IMAGE'
  | 'SHOW_DIFF_HIGHLIGHT'
  | 'HIDE_DIFF_HIGHLIGHT'
  | 'CAPTURE_DIFF'
  | 'SYNC_STATE_CHANGED'
  | 'CAPTURE_TAB'
  | 'PING';

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
  target?: TargetHint;
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
  targetKind?: 'window' | 'element';
  target?: TargetHint;
  scrollableIndex?: number;
  scrollAxis?: 'x' | 'y' | 'both';
}

// ─── Location Message ───────────────────────────────────────────────────────
export interface LocationMessage extends BaseMessage {
  type: 'LOCATION_CHANGE';
  pathname: string;
  search: string;
  hash: string;
  href: string;
}

// ─── DOM Target Hint ────────────────────────────────────────────────────────
export interface TargetHint {
  xRatio: number;
  yRatio: number;
  rectLeftRatio?: number;
  rectTopRatio?: number;
  rectWidthRatio?: number;
  rectHeightRatio?: number;
  tagName: string;
  id: string;
  className: string;
  name: string;
  elementType: string;
  ariaLabel: string;
  placeholder: string;
  role?: string;
  text?: string;
}

// ─── Form Messages ──────────────────────────────────────────────────────────
export interface FormMessage extends BaseMessage {
  type: 'INPUT' | 'CHANGE';
  target: TargetHint;
  value: string;
  checked: boolean | null;
  selectedIndex: number | null;
  selectionStart: number | null;
  selectionEnd: number | null;
}

// ─── Keyboard Messages ──────────────────────────────────────────────────────
export interface KeyboardMessage extends BaseMessage {
  type: 'KEY_DOWN' | 'KEY_UP';
  target: TargetHint;
  key: string;
  code: string;
  location: number;
  keyCode: number;
  which: number;
  charCode: number;
  repeat: boolean;
  isComposing: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

// ─── Drag Messages ───────────────────────────────────────────────────────────
export interface DragMessage extends BaseMessage {
  type: 'DRAG_START' | 'DRAG_MOVE' | 'DRAG_END';
  xRatio: number;
  yRatio: number;
  button: number;
  buttons: number;
  pointerType?: 'mouse' | 'touch' | 'pen';
  pointerId?: number;
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

// ─── Diff Highlight Message ─────────────────────────────────────────────────
export interface DiffHighlightMessage extends BaseMessage {
  type: 'SET_DIFF_IMAGE' | 'SHOW_DIFF_HIGHLIGHT' | 'HIDE_DIFF_HIGHLIGHT';
  referenceImageDataUrl?: string;
  targetImageDataUrl?: string;
  opacity?: number;
  threshold?: number;
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

// ─── Capture Diff Message ───────────────────────────────────────────────────
export interface CaptureDiffMessage extends BaseMessage {
  type: 'CAPTURE_DIFF';
  direction: 'A_TO_B' | 'B_TO_A';
  opacity: number;
  threshold: number;
}

// ─── Ping Message ───────────────────────────────────────────────────────────
export interface PingMessage extends BaseMessage {
  type: 'PING';
}

// ─── Union ───────────────────────────────────────────────────────────────────
export type ExtensionMessage =
  | PointerMessage
  | WheelMessage
  | ScrollMessage
  | LocationMessage
  | FormMessage
  | KeyboardMessage
  | DragMessage
  | GridMessage
  | CompareOverlayMessage
  | BlinkMessage
  | DiffHighlightMessage
  | SyncStateChangedMessage
  | CaptureTabMessage
  | CaptureDiffMessage
  | PingMessage;
