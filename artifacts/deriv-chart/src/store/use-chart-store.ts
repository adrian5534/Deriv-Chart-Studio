import { create } from 'zustand';
import { ASSETS } from '../lib/deriv-constants';
import { CandleData } from '../hooks/use-deriv-websocket';

export type DrawingTool = 'cursor' | 'trendline' | 'hline' | 'fib' | 'rect' | 'ray';
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

export interface Drawing {
  id: string;
  type: 'trendline' | 'ray' | 'hline' | 'rect' | 'fib';
  points: Point[];
  color?: string;
  lineWidth?: number;
  lineStyle?: DrawingLineStyle;
  fillOpacity?: number;
  locked?: boolean;

  // show on specific chart timeframes only; empty/undefined = all
  visibleTimeframes?: number[];

  // fib settings
  fibReverse?: boolean;
  fibExtendLeft?: boolean;
  fibExtendRight?: boolean;
  fibShowLabels?: boolean;
  fibLevels?: FibLevel[];
}

interface ChartState {
  symbol: string;
  timeframe: number;
  livePrice: number | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';

  // Drawing tools
  activeTool: DrawingTool;
  drawings: Drawing[];
  selectedDrawingId: string | null;

  // Indicators
  indicators: {
    ma: boolean;
    rsi: boolean;
    atr: boolean;
  };

  // Replay
  replay: {
    active: boolean;
    date: string | null;
    playing: boolean;
    speed: number;
    candles: CandleData[];
    index: number;
  };

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (tf: number) => void;
  setLivePrice: (p: number) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;
  setActiveTool: (t: DrawingTool) => void;

  addDrawing: (d: Omit<Drawing, 'color' | 'lineWidth' | 'lineStyle' | 'fillOpacity' | 'locked'> & Partial<Pick<Drawing, 'color' | 'lineWidth' | 'lineStyle' | 'fillOpacity' | 'locked'>>) => void;
  updateDrawing: (id: string, d: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;

  setSelectedDrawingId: (id: string | null) => void;
  updateSelectedDrawing: (updates: Partial<Drawing>) => void;

  toggleIndicator: (ind: keyof ChartState['indicators']) => void;
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
  return {
    ...drawing,
    color: drawing.color || DEFAULT_DRAWING_STYLE.color,
    lineWidth: clampLineWidth(drawing.lineWidth),
    lineStyle: drawing.lineStyle || DEFAULT_DRAWING_STYLE.lineStyle,
    fillOpacity: clampFillOpacity(drawing.fillOpacity),
    locked: drawing.locked ?? DEFAULT_DRAWING_STYLE.locked,
  };
}

function normalizeDrawingUpdates(updates: Partial<Drawing>): Partial<Drawing> {
  const normalized: Partial<Drawing> = { ...updates };

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

  indicators: {
    ma: false,
    rsi: false,
    atr: false,
  },

  replay: {
    active: false,
    date: null,
    playing: false,
    speed: 500,
    candles: [],
    index: 0,
  },

  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setLivePrice: (livePrice) => set({ livePrice }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setActiveTool: (activeTool) => set({ activeTool }),

  addDrawing: (drawing) =>
    set((state) => {
      const nextDrawing = normalizeDrawing(drawing);
      return {
        drawings: [...state.drawings, nextDrawing],
        selectedDrawingId: nextDrawing.id,
      };
    }),

  updateDrawing: (id, updates) =>
    set((state) => ({
      drawings: state.drawings.map((drawing) =>
        drawing.id === id ? { ...drawing, ...normalizeDrawingUpdates(updates) } : drawing,
      ),
    })),

  removeDrawing: (id) =>
    set((state) => ({
      drawings: state.drawings.filter((drawing) => drawing.id !== id),
      selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId,
    })),

  clearDrawings: () =>
    set({
      drawings: [],
      selectedDrawingId: null,
    }),

  setSelectedDrawingId: (selectedDrawingId) => set({ selectedDrawingId }),

  updateSelectedDrawing: (updates) =>
    set((state) => {
      if (!state.selectedDrawingId) {
        return state;
      }

      const normalizedUpdates = normalizeDrawingUpdates(updates);

      return {
        drawings: state.drawings.map((drawing) =>
          drawing.id === state.selectedDrawingId
            ? { ...drawing, ...normalizedUpdates }
            : drawing,
        ),
      };
    }),

  toggleIndicator: (ind) =>
    set((state) => ({
      indicators: { ...state.indicators, [ind]: !state.indicators[ind] },
    })),

  setReplayState: (updates) =>
    set((state) => ({
      replay: { ...state.replay, ...updates },
    })),

  stopReplay: () =>
    set((state) => ({
      replay: { ...state.replay, active: false, playing: false, candles: [], index: 0, date: null },
    })),
}));