import { create } from 'zustand';
import { ASSETS } from '../lib/deriv-constants';
import { CandleData } from '../hooks/use-deriv-websocket';

export type DrawingTool = 'cursor' | 'trendline' | 'hline' | 'fib' | 'rect' | 'ray';

export interface Point {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingTool;
  points: Point[];
  text?: string;
  color?: string;
}

interface ChartState {
  symbol: string;
  timeframe: number;
  livePrice: number | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';

  // Drawing tools
  activeTool: DrawingTool;
  drawings: Drawing[];

  // Indicators
  indicators: {
    ma: boolean;
    rsi: boolean;
    atr: boolean;
  };

  // Replay
  replay: {
    active: boolean;
    date: string | null; // ISO date string
    playing: boolean;
    speed: number; // ms between candles
    candles: CandleData[];
    index: number; // how many candles currently shown
  };

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (tf: number) => void;
  setLivePrice: (p: number) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;
  setActiveTool: (t: DrawingTool) => void;
  addDrawing: (d: Drawing) => void;
  updateDrawing: (id: string, d: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;
  toggleIndicator: (ind: keyof ChartState['indicators']) => void;
  setReplayState: (state: Partial<ChartState['replay']>) => void;
  stopReplay: () => void;
}

export const useChartStore = create<ChartState>((set) => ({
  symbol: ASSETS[0].symbol,
  timeframe: 60,
  livePrice: null,
  connectionStatus: 'connecting',

  activeTool: 'cursor',
  drawings: [],

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
  addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, d] })),
  updateDrawing: (id, updates) => set((s) => ({
    drawings: s.drawings.map(d => d.id === id ? { ...d, ...updates } : d),
  })),
  removeDrawing: (id) => set((s) => ({ drawings: s.drawings.filter(d => d.id !== id) })),
  clearDrawings: () => set({ drawings: [] }),

  toggleIndicator: (ind) => set((s) => ({
    indicators: { ...s.indicators, [ind]: !s.indicators[ind] },
  })),

  setReplayState: (updates) => set((s) => ({
    replay: { ...s.replay, ...updates },
  })),

  stopReplay: () => set((s) => ({
    replay: { ...s.replay, active: false, playing: false, candles: [], index: 0, date: null },
  })),
}));
