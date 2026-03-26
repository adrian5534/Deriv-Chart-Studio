import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, type LogicalRange } from 'lightweight-charts';
import { useChartStore } from '../../store/use-chart-store';
import { useDerivWebSocket, CandleData } from '../../hooks/use-deriv-websocket';
import DrawingOverlay from './DrawingOverlay';
import DrawingSettingsPanel from './DrawingSettingsPanel';
import AlertPopup from './AlertPopup';

export interface ChartRef {
  getChart: () => IChartApi | null;
  getSeries: () => ISeriesApi<'Candlestick'> | null;
  loadReplayCandles: (date: string) => Promise<CandleData[]>;
}

const LightweightChart = forwardRef<ChartRef, Record<string, never>>((_, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [overlayRedrawKey, setOverlayRedrawKey] = useState(0);
  const [triggeredAlert, setTriggeredAlert] = useState<{ symbol: string; price: number; condition: string } | null>(null);

  const [pendingRange, setPendingRange] = useState<{ from: number; to: number } | null>(null);
  const prevTimeframe = useRef<string | null>(null);
  const prevReplayCandlesRef = useRef<CandleData[] | null>(null);

  const bumpOverlayRedraw = useCallback(() => {
    setOverlayRedrawKey((v) => v + 1);
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
      const range = chartRef.current.timeScale().getVisibleLogicalRange() as LogicalRange | null;
      if (range) {
        const candles = useChartStore.getState().replay.candles;
        const fromIdx = Math.max(Math.floor(range.from), 0);
        const toIdx = Math.min(Math.ceil(range.to), candles.length - 1);
        const fromTime = candles[fromIdx]?.time;
        const toTime = candles[toIdx]?.time;
        if (fromTime && toTime) {
          setPendingRange({ from: fromTime as number, to: toTime as number });
        }
      }
    }
    prevTimeframe.current = String(timeframe);
  }, [timeframe, replayActive]);

  // After candles are loaded for new timeframe, restore visible range
  useEffect(() => {
    if (!pendingRange || !chartRef.current) return;
    const data = useChartStore.getState().replay.candles;
    if (!data.length) return;
    const fromIdx = data.findIndex((bar) => Number(bar.time) >= pendingRange.from);
    const toIdx = data.findIndex((bar) => Number(bar.time) >= pendingRange.to);
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
    console.log('[Chart] initialized. container size:', chartContainerRef.current?.clientWidth, 'x', chartContainerRef.current?.clientHeight);

    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setIsReady(false);
    };
  }, [bumpOverlayRedraw]);

  const { loadReplayCandles } = useDerivWebSocket({
    onHistoricalData: (data) => {
      console.log('[Chart] onHistoricalData', data.length, 'candles, series ready:', !!seriesRef.current);
      if (!seriesRef.current) return;
      if (useChartStore.getState().replay.active) return;

      const sorted = [...data]
        .sort((a, b) => (a.time as number) - (b.time as number))
        .filter((v, i, arr) => i === 0 || v.time !== arr[i - 1].time);

      console.log('[Chart] first candle:', sorted[0], 'last:', sorted[sorted.length - 1]);
      try {
        seriesRef.current.setData(sorted as any);
        chartRef.current?.timeScale().scrollToRealTime();
        chartRef.current?.timeScale().fitContent();
        requestAnimationFrame(() => bumpOverlayRedraw());
      } catch (err) {
        console.error('[Chart] setData error:', err);
      }
    },

    onLiveUpdate: (data) => {
      if (!seriesRef.current) return;
      if (useChartStore.getState().replay.active) return;

      try {
        seriesRef.current.update(data);
        requestAnimationFrame(() => bumpOverlayRedraw());
      } catch { /* ignore */ }
    },

    onAlertTriggered: (alert) => setTriggeredAlert(alert),
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
        requestAnimationFrame(() => bumpOverlayRedraw());
      } catch { /* ignore */ }

      setReplayState({ index: nextIndex });
    }, replaySpeed);

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [replayActive, replayPlaying, replaySpeed, replayCandles, setReplayState, bumpOverlayRedraw]);

  // Map replay progress when timeframe changes
  useEffect(() => {
    if (!replayActive) {
      prevReplayCandlesRef.current = null;
      return;
    }
    if (prevReplayCandlesRef.current === replayCandles) return;
    prevReplayCandlesRef.current = replayCandles;
    if (!replayCandles?.length) return;

    const storeReplay = useChartStore.getState().replay as any;
    const startEpoch = typeof storeReplay.startEpoch === 'number' ? storeReplay.startEpoch : undefined;
    const startProgress = typeof storeReplay.startProgress === 'number' ? storeReplay.startProgress : undefined;
    const prevIdx = typeof storeReplay.index === 'number' ? storeReplay.index : undefined;
    const prevLen = Array.isArray(storeReplay.candles) ? storeReplay.candles.length : 0;

    let mappedIndex = 0;
    if (typeof startEpoch === 'number') {
      const startIdx = replayCandles.findIndex((c) => Number(c.time) >= startEpoch);
      if (startIdx >= 0) {
        mappedIndex = Math.max(0, Math.min(replayCandles.length - 1, startIdx));
      } else if (typeof startProgress === 'number') {
        mappedIndex = Math.round(startProgress * Math.max(0, replayCandles.length - 1));
      } else if (typeof prevIdx === 'number' && prevLen > 1) {
        mappedIndex = Math.round((prevIdx / (prevLen - 1)) * Math.max(0, replayCandles.length - 1));
      } else {
        mappedIndex = Math.min(5, replayCandles.length - 1);
      }
    } else if (typeof startProgress === 'number') {
      mappedIndex = Math.round(startProgress * Math.max(0, replayCandles.length - 1));
    } else if (typeof prevIdx === 'number' && prevLen > 1) {
      mappedIndex = Math.round((prevIdx / (prevLen - 1)) * Math.max(0, replayCandles.length - 1));
    } else {
      mappedIndex = Math.min(5, replayCandles.length - 1);
    }

    if (mappedIndex !== storeReplay.index || storeReplay.candles !== replayCandles) {
      setReplayState({ ...storeReplay, candles: replayCandles, index: mappedIndex });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayCandles, replayActive]);

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
            series={seriesRef.current as ISeriesApi<'Candlestick', 'Time'>}
            redrawKey={overlayRedrawKey}
          />
        )}
      </div>

      {isReady && chartRef.current && seriesRef.current && (
        <DrawingSettingsPanel />
      )}

      <AlertPopup
        alert={triggeredAlert}
        onClose={() => setTriggeredAlert(null)}
      />
    </div>
  );
});

LightweightChart.displayName = 'LightweightChart';

export default LightweightChart;