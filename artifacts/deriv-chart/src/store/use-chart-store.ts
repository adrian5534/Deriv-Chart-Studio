import { create } from 'zustand';
import { ASSETS } from '../lib/deriv-constants';
import { CandleData } from '../hooks/use-deriv-websocket';

export type DrawingTool = 'cursor' | 'trendline' | 'hline' | 'fib' | 'rect' | 'ray' | 'rrLong' | 'rrShort';
export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export interface Point {
  time: number;
  price: number;
  logical?: number;
}

export interface FibLevel {
  value: number;
  label?: string;
  color?: string;
  visible?: boolean;
  lineStyle?: DrawingLineStyle;
}

export type DrawingLabelHorizontalAlign = 'left' | 'center' | 'right';
export type DrawingLabelVerticalAlign = 'top' | 'middle' | 'bottom';
export type FibLabelMode = 'percent' | 'price';

export type Drawing = {
  id: string;
  type: string;
  points: Point[];
  color?: string;
  lineWidth?: number;
  lineStyle?: DrawingLineStyle;
  fillOpacity?: number;
  rrMultiplier?: number;
  rrType?: 'long' | 'short';
  showPriceLabels?: boolean;
  fibLabelMode?: FibLabelMode;
  labelHorizontalAlign?: DrawingLabelHorizontalAlign;
  labelVerticalAlign?: DrawingLabelVerticalAlign;
  visibleTimeframes?: number[] | undefined;
  locked?: boolean;
  baseTimeframe?: number;
};

export interface Alert {
  id: string;
  symbol: string;
  price: number;
  condition: 'above' | 'below';
  soundEnabled: boolean;
  createdAt: string;
}

interface ChartState {
  symbol: string;
  timeframe: number;
  livePrice: number | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';

  activeTool: DrawingTool;
  drawings: Drawing[];
  selectedDrawingId: string | null;

  indicators: {
    ma: boolean;
    rsi: boolean;
    atr: boolean;
  };

  alerts: Alert[];

  replay: {
    active: boolean;
    date: string | null;
    playing: boolean;
    speed: number;
    candles: CandleData[];
    index: number;
    startEpoch?: number;
    startProgress?: number;
  };

  setSymbol: (s: string) => void;
  setTimeframe: (tf: number) => void;
  setLivePrice: (p: number) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;
  setActiveTool: (t: DrawingTool) => void;

  addDrawing: (d: Omit<Drawing, 'color' | 'lineWidth' | 'lineStyle' | 'fillOpacity' | 'locked'>) => void;
  updateDrawing: (id: string, d: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;

  setSelectedDrawingId: (id: string | null) => void;
  updateSelectedDrawing: (updates: Partial<Drawing>) => void;

  toggleIndicator: (ind: keyof ChartState['indicators']) => void;

  addAlert: (alert: Omit<Alert, 'id' | 'createdAt'>) => void;
  removeAlert: (id: string) => void;
  updateAlert: (id: string, updates: Partial<Alert>) => void;
  clearAlerts: () => void;

  setReplayState: (state: Partial<ChartState['replay']>) => void;
  stopReplay: () => void;
}

const DEFAULT_DRAWING_STYLE = {
  color: '#2962FF',
  lineWidth: 2,
  lineStyle: 'solid' as DrawingLineStyle,
  fillOpacity: 0.12,
  locked: false,
};

function clampLineWidth(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_DRAWING_STYLE.lineWidth;
  return Math.max(1, Math.min(8, Math.round(value)));
}

function clampFillOpacity(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_DRAWING_STYLE.fillOpacity;
  return Math.max(0, Math.min(1, value));
}

function normalizeDrawing(
  drawing: Omit<Drawing, 'color' | 'lineWidth' | 'lineStyle' | 'fillOpacity' | 'locked'> &
    Partial<Pick<Drawing, 'color' | 'lineWidth' | 'lineStyle' | 'fillOpacity' | 'locked'>>,
): Drawing {
  const normalizedPoints = drawing.points.map((point) => ({
    ...point,
    logical: typeof point.logical === 'number' ? point.logical : undefined,
  }));

  return {
    ...drawing,
    points: normalizedPoints as Point[],
    color: drawing.color || (drawing.rrType === 'long' ? '#26a69a' : drawing.rrType === 'short' ? '#ef5350' : DEFAULT_DRAWING_STYLE.color),
    lineWidth: clampLineWidth(drawing.lineWidth),
    lineStyle: drawing.lineStyle || DEFAULT_DRAWING_STYLE.lineStyle,
    fillOpacity: clampFillOpacity(drawing.fillOpacity),
    locked: drawing.locked ?? DEFAULT_DRAWING_STYLE.locked,
    showPriceLabels: drawing.showPriceLabels ?? (drawing.type === 'hline' || drawing.type === 'rr'),
    fibLabelMode: drawing.fibLabelMode ?? 'percent',
    labelHorizontalAlign: drawing.labelHorizontalAlign ?? 'right',
    labelVerticalAlign: drawing.labelVerticalAlign ?? 'top',
  };
}

function normalizeDrawingUpdates(updates: Partial<Drawing>): Partial<Drawing> {
  const normalized: Partial<Drawing> = { ...updates };

  if ('points' in updates && Array.isArray(updates.points)) {
    normalized.points = updates.points.map((p) => ({
      time: p.time,
      price: p.price,
      logical: p.logical,
    }));
  }

  if ('lineWidth' in updates) {
    normalized.lineWidth = clampLineWidth(updates.lineWidth);
  }

  if ('fillOpacity' in updates) {
    normalized.fillOpacity = clampFillOpacity(updates.fillOpacity);
  }

  if ('color' in updates && !updates.color) {
    normalized.color = DEFAULT_DRAWING_STYLE.color;
  }

  if ('lineStyle' in updates && !updates.lineStyle) {
    normalized.lineStyle = DEFAULT_DRAWING_STYLE.lineStyle;
  }

  if ('rrType' in updates) normalized.rrType = updates.rrType;
  if ('rrMultiplier' in updates) normalized.rrMultiplier = updates.rrMultiplier;
  if ('baseTimeframe' in updates) normalized.baseTimeframe = updates.baseTimeframe;

  return normalized;
}

export const useChartStore = create<ChartState>((set) => ({
  symbol: ASSETS[0].symbol,
  timeframe: 60,
  livePrice: null,
  connectionStatus: 'connecting',

  activeTool: 'cursor',
  drawings: [],
  selectedDrawingId: null,

  indicators: { ma: false, rsi: false, atr: false },
  alerts: [],

  replay: {
    active: false,
    date: null,
    playing: false,
    speed: 500,
    candles: [],
    index: 0,
    startEpoch: undefined,
    startProgress: undefined,
  },

  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setLivePrice: (livePrice) => set({ livePrice }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setActiveTool: (activeTool) => set({ activeTool }),

  addDrawing: (drawing) => {
    set((state) => ({
      drawings: [...state.drawings, normalizeDrawing(drawing)],
    }));
  },

  updateDrawing: (id, updates) =>
    set((state) => {
      const drawing = state.drawings.find((d) => d.id === id);
      if (!drawing) return state;
      return {
        drawings: state.drawings.map((d) =>
          d.id === id ? { ...d, ...normalizeDrawingUpdates(updates) } : d,
        ),
      };
    }),

  removeDrawing: (id) =>
    set((state) => ({
      drawings: state.drawings.filter((d) => d.id !== id),
      selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId,
    })),

  clearDrawings: () => set({ drawings: [], selectedDrawingId: null }),

  setSelectedDrawingId: (selectedDrawingId) => set({ selectedDrawingId }),

  updateSelectedDrawing: (updates) =>
    set((state) => {
      if (!state.selectedDrawingId) return state;
      const normalizedUpdates = normalizeDrawingUpdates(updates);
      return {
        drawings: state.drawings.map((d) =>
          d.id === state.selectedDrawingId ? { ...d, ...normalizedUpdates } : d,
        ),
      };
    }),

  toggleIndicator: (ind) =>
    set((state) => ({
      indicators: { ...state.indicators, [ind]: !state.indicators[ind] },
    })),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [
        ...state.alerts,
        { ...alert, id: `alert-${Date.now()}`, createdAt: new Date().toISOString() },
      ],
    })),

  removeAlert: (id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

  updateAlert: (id, updates) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  clearAlerts: () => set({ alerts: [] }),

  setReplayState: (updates) =>
    set((state) => ({ replay: { ...state.replay, ...updates } })),

  stopReplay: () =>
    set((state) => ({
      replay: {
        ...state.replay,
        active: false,
        playing: false,
        candles: [],
        index: 0,
        date: null,
        startEpoch: undefined,
        startProgress: undefined,
      },
    })),
}));
