import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
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
  const allCandlesRef = useRef<CandleData[]>([]);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isReady, setIsReady] = useState(false);

  const replay = useChartStore(s => s.replay);
  const setReplayState = useChartStore(s => s.setReplayState);

  // Initialize Chart once
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

  // WebSocket data integration
  const { loadReplayCandles } = useDerivWebSocket({
    onHistoricalData: (data) => {
      if (!seriesRef.current) return;
      if (replay.active) return; // Don't overwrite replay data with live data
      const sorted = [...data]
        .sort((a, b) => (a.time as number) - (b.time as number))
        .filter((v, i, arr) => i === 0 || v.time !== arr[i - 1].time);
      allCandlesRef.current = sorted;
      seriesRef.current.setData(sorted);
    },
    onLiveUpdate: (data) => {
      if (!seriesRef.current || replay.active) return;
      seriesRef.current.update(data);
      // Keep allCandlesRef updated with live data
      const last = allCandlesRef.current[allCandlesRef.current.length - 1];
      if (last && last.time === data.time) {
        allCandlesRef.current[allCandlesRef.current.length - 1] = data;
      } else {
        allCandlesRef.current.push(data);
      }
    },
  });

  // Replay engine: advance index and update chart when playing
  useEffect(() => {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    if (!replay.active || !replay.playing || !seriesRef.current) return;
    const candles = replay.candles;
    if (!candles.length) return;

    replayTimerRef.current = setInterval(() => {
      const nextIndex = useChartStore.getState().replay.index + 1;
      if (nextIndex >= candles.length) {
        // Reached end of replay data
        clearInterval(replayTimerRef.current!);
        setReplayState({ playing: false });
        return;
      }
      setReplayState({ index: nextIndex });
      seriesRef.current?.update(candles[nextIndex]);
    }, replay.speed);

    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, [replay.active, replay.playing, replay.speed, replay.candles, setReplayState]);

  // When replay is activated: load candles and show initial slice
  useEffect(() => {
    if (!replay.active || !replay.date || !seriesRef.current) return;
    if (replay.candles.length > 0) {
      // Candles already loaded, just show them up to current index
      const slice = replay.candles.slice(0, Math.max(1, replay.index));
      seriesRef.current.setData(slice);
    }
  }, [replay.active, replay.candles, replay.index, replay.date]);

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
