import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '../../store/use-chart-store';
import { useDerivWebSocket, CandleData } from '../../hooks/use-deriv-websocket';
import DrawingOverlay from './DrawingOverlay';

export interface ChartRef {
  getChart: () => IChartApi | null;
  getSeries: () => ISeriesApi<"Candlestick"> | null;
  loadReplayCandles: (date: string) => Promise<CandleData[]>;
}

const LightweightChart = forwardRef<ChartRef, {}>((_, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isReady, setIsReady] = useState(false);

  // Extract each replay field individually so useEffect deps are plain values
  const replayActive  = useChartStore(s => s.replay.active);
  const replayPlaying = useChartStore(s => s.replay.playing);
  const replaySpeed   = useChartStore(s => s.replay.speed);
  const replayCandles = useChartStore(s => s.replay.candles);
  const setReplayState = useChartStore(s => s.setReplayState);

  // ─── Initialize chart once ────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'Solid' as const, color: '#0B0E14' },
        textColor: '#9B9EA8',
      },
      grid: {
        vertLines: { color: '#1A1D27' },
        horzLines: { color: '#1A1D27' },
      },
      crosshair: {
        mode: 0,
        vertLine: { width: 1, color: '#555a6b', style: 2 },
        horzLine: { width: 1, color: '#555a6b', style: 2 },
      },
      timeScale: {
        borderColor: '#1A1D27',
        timeVisible: true,
        secondsVisible: true,
      },
      rightPriceScale: {
        borderColor: '#1A1D27',
        autoScale: true,
      },
      autoSize: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    setIsReady(true);

    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setIsReady(false);
    };
  }, []);

  // ─── Live WebSocket data ──────────────────────────────────────────────────
  const { loadReplayCandles } = useDerivWebSocket({
    onHistoricalData: (data) => {
      if (!seriesRef.current) return;
      // Never overwrite chart while replay is active
      if (useChartStore.getState().replay.active) return;

      const sorted = [...data]
        .sort((a, b) => (a.time as number) - (b.time as number))
        .filter((v, i, arr) => i === 0 || v.time !== arr[i - 1].time);

      try { seriesRef.current.setData(sorted); } catch { /* ignore */ }
    },

    onLiveUpdate: (data) => {
      if (!seriesRef.current) return;
      if (useChartStore.getState().replay.active) return;
      try {
        seriesRef.current.update(data);
      } catch {
        // Tick arrived for an out-of-order candle — safe to skip
      }
    },
  });

  // ─── Replay engine ────────────────────────────────────────────────────────
  // Driven solely by setData(growing slice) — no update() calls —
  // to avoid any race between setData and update ordering requirements.
  useEffect(() => {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    if (!replayActive || !replayCandles.length || !seriesRef.current) return;

    // Show initial slice immediately
    const idx = useChartStore.getState().replay.index;
    try {
      seriesRef.current.setData(replayCandles.slice(0, Math.max(1, idx + 1)));
    } catch { /* ignore */ }

    if (!replayPlaying) return;

    replayTimerRef.current = setInterval(() => {
      const { replay } = useChartStore.getState();
      if (!seriesRef.current || !replay.active) return;

      const nextIndex = replay.index + 1;
      if (nextIndex >= replay.candles.length) {
        clearInterval(replayTimerRef.current!);
        replayTimerRef.current = null;
        setReplayState({ playing: false });
        return;
      }

      try {
        seriesRef.current.setData(replay.candles.slice(0, nextIndex + 1));
      } catch { /* ignore */ }

      setReplayState({ index: nextIndex });
    }, replaySpeed);

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  // NOTE: these are plain extracted values, NOT hook calls
  }, [replayActive, replayPlaying, replaySpeed, replayCandles, setReplayState]);

  // ─── Expose API via ref ───────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
    getSeries: () => seriesRef.current,
    loadReplayCandles,
  }));

  return (
    <div className="relative w-full h-full">
      <div ref={chartContainerRef} className="absolute inset-0" />
      {isReady && chartRef.current && seriesRef.current && (
        <DrawingOverlay chart={chartRef.current} series={seriesRef.current} />
      )}
    </div>
  );
});

LightweightChart.displayName = 'LightweightChart';
export default LightweightChart;
