import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, LogicalRange } from 'lightweight-charts';
import { useChartStore } from '../../store/use-chart-store';
import { useDerivWebSocket, CandleData } from '../../hooks/use-deriv-websocket';
import DrawingOverlay from './DrawingOverlay';
import DrawingSettingsPanel from './DrawingSettingsPanel';

export interface ChartRef {
  getChart: () => IChartApi | null;
  getSeries: () => ISeriesApi<"Candlestick"> | null;
  loadReplayCandles: (date: string) => Promise<CandleData[]>;
}

const LightweightChart = forwardRef<ChartRef, Record<string, never>>((_, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [overlayRedrawKey, setOverlayRedrawKey] = useState(0);

  // --- Multi-timeframe replay alignment ---
  const [pendingRange, setPendingRange] = useState<{from: number, to: number} | null>(null);
  const prevReplayActive = useRef(false);
  const prevTimeframe = useRef<string | null>(null);
  // ----------------------------------------

  const bumpOverlayRedraw = useCallback(() => {
    setOverlayRedrawKey((value) => value + 1);
  }, []);

  const replayActive = useChartStore((state) => state.replay.active);
  const replayPlaying = useChartStore((state) => state.replay.playing);
  const replaySpeed = useChartStore((state) => state.replay.speed);
  const replayCandles = useChartStore((state) => state.replay.candles);
  const setReplayState = useChartStore((state) => state.setReplayState);
  const timeframe = useChartStore((state) => state.timeframe);

  // Save visible time range before timeframe changes in replay mode
  useEffect(() => {
    if (!replayActive || !chartRef.current || !seriesRef.current) {
      prevTimeframe.current = String(timeframe);
      return;
    }
    if (prevTimeframe.current && prevTimeframe.current !== String(timeframe)) {
      // Timeframe changed in replay mode
      const range = chartRef.current.timeScale().getVisibleLogicalRange();
      if (range && seriesRef.current) {
        const data = seriesRef.current.data();
        const fromIdx = Math.max(Math.floor(range.from), 0);
        const toIdx = Math.min(Math.ceil(range.to), data.length - 1);
        const fromTime = data[fromIdx]?.time;
        const toTime = data[toIdx]?.time;
        if (fromTime && toTime) {
          setPendingRange({ from: fromTime as number, to: toTime as number });
        }
      }
    }
    prevTimeframe.current = String(timeframe);
  }, [timeframe, replayActive]);

  // After candles are loaded for new timeframe, set visible range to match previous timestamps
  useEffect(() => {
    if (!pendingRange || !chartRef.current || !seriesRef.current) return;
    const data = seriesRef.current.data();
    if (!data.length) return;
    // Find logical bars for these timestamps
    const fromIdx = data.findIndex(bar => Number(bar.time) >= pendingRange.from);
    const toIdx = data.findIndex(bar => Number(bar.time) >= pendingRange.to);
    if (fromIdx !== -1 && toIdx !== -1) {
      chartRef.current.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });
    }
    setPendingRange(null);
  }, [pendingRange, replayCandles]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E14' },
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
        rightOffset: 12,
        fixRightEdge: false,
        rightBarStaysOnScroll: true,
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
    bumpOverlayRedraw();

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
      }

      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setIsReady(false);
    };
  }, [bumpOverlayRedraw]);

  const { loadReplayCandles } = useDerivWebSocket({
    onHistoricalData: (data) => {
      if (!seriesRef.current) return;
      if (useChartStore.getState().replay.active) return;

      const sorted = [...data]
        .sort((a, b) => (a.time as number) - (b.time as number))
        .filter((value, index, array) => index === 0 || value.time !== array[index - 1].time);

      try {
        seriesRef.current.setData(sorted);
        requestAnimationFrame(() => bumpOverlayRedraw());
      } catch {
        // ignore
      }
    },

    onLiveUpdate: (data) => {
      if (!seriesRef.current) return;
      if (useChartStore.getState().replay.active) return;

      try {
        seriesRef.current.update(data);
        requestAnimationFrame(() => bumpOverlayRedraw());
      } catch {
        // ignore
      }
    },
  });

  useEffect(() => {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    if (!replayActive || !replayCandles.length || !seriesRef.current) return;

    const index = useChartStore.getState().replay.index;

    try {
      seriesRef.current.setData(replayCandles.slice(0, Math.max(1, index + 1)));
      requestAnimationFrame(() => bumpOverlayRedraw());
    } catch {
      // ignore
    }

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
        requestAnimationFrame(() => bumpOverlayRedraw());
      } catch {
        // ignore
      }

      setReplayState({ index: nextIndex });
    }, replaySpeed);

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [replayActive, replayPlaying, replaySpeed, replayCandles, setReplayState, bumpOverlayRedraw]);

  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
    getSeries: () => seriesRef.current,
    loadReplayCandles,
  }));

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 overflow-hidden">
        <div ref={chartContainerRef} className="absolute inset-0" />

        {isReady && chartRef.current && seriesRef.current && (
          <DrawingOverlay
            chart={chartRef.current}
            series={seriesRef.current}
            redrawKey={overlayRedrawKey}
          />
        )}
      </div>

      {isReady && chartRef.current && seriesRef.current && <DrawingSettingsPanel />}
    </div>
  );
});

LightweightChart.displayName = 'LightweightChart';

export default LightweightChart;