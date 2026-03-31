import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, LogicalRange, Time } from 'lightweight-charts';
import { useChartStore } from '../../store/use-chart-store';
import { useDerivWebSocket, CandleData } from '../../hooks/use-deriv-websocket';
import DrawingOverlay from './DrawingOverlay';
import DrawingSettingsPanel from './DrawingSettingsPanel';
import RiskRewardTool from './RiskRewardTool';
import AlertPopup from './AlertPopup';

export interface ChartRef {
  getChart: () => IChartApi | null;
  getSeries: () => ISeriesApi<"Candlestick", Time> | null;
  loadReplayCandles: (date: string) => Promise<CandleData[]>;
}

const LightweightChart = forwardRef<ChartRef, Record<string, never>>((_, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeframeSwitchCancelRef = useRef<AbortController | null>(null);
  const timeframeSwitchAbortRef = useRef<AbortController | null>(null);
  const lastTimeframeRef = useRef<number | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [overlayRedrawKey, setOverlayRedrawKey] = useState(0);
  const [triggeredAlert, setTriggeredAlert] = useState<{ symbol: string; price: number; condition: string } | null>(null);

  const [pendingRange, setPendingRange] = useState<{from: number, to: number} | null>(null);
  const pendingLiveRangeRef = useRef<{ from: number; to: number; width: number } | null>(null);
  const prevTimeframe = useRef<string | null>(null);

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

  // Capture visible timestamps before timeframe changes in live mode
  useEffect(() => {
    if (replayActive) return;
    if (!chartRef.current || !seriesRef.current) {
      prevTimeframe.current = String(timeframe);
      return;
    }
    if (prevTimeframe.current && prevTimeframe.current !== String(timeframe)) {
      const range = chartRef.current.timeScale().getVisibleLogicalRange();
      if (range && seriesRef.current) {
        const data = seriesRef.current.data();
        const fromIdx = Math.max(Math.floor(range.from), 0);
        const toIdx = Math.min(Math.ceil(range.to), data.length - 1);
        const fromTime = data[fromIdx]?.time;
        const toTime = data[toIdx]?.time;
        if (fromTime && toTime) {
          const width = Math.max(1, toIdx - fromIdx);
          pendingLiveRangeRef.current = { from: Number(fromTime), to: Number(toTime), width };
        }
      }
    }
    prevTimeframe.current = String(timeframe);
  }, [timeframe, replayActive]);

  // After candles are loaded for new timeframe, restore visible range
  useEffect(() => {
    if (!pendingRange || !chartRef.current || !seriesRef.current) return;
    const data = seriesRef.current.data();
    if (!data.length) return;
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

  const { loadReplayCandles, getCachedHistorical } = useDerivWebSocket({
    onHistoricalData: (data) => {
      if (!seriesRef.current) return;
      if (useChartStore.getState().replay.active) return;

      const sorted = [...data]
        .sort((a, b) => (a.time as number) - (b.time as number))
        .filter((value, index, array) => index === 0 || value.time !== array[index - 1].time);

      try {
        seriesRef.current.setData(sorted);

        if (pendingLiveRangeRef.current && chartRef.current) {
          const { from, width } = pendingLiveRangeRef.current;
          const newFromIdx = sorted.findIndex(bar => Number(bar.time) >= from);
          if (newFromIdx !== -1) {
            const newToIdx = Math.min(sorted.length - 1, newFromIdx + Math.max(1, width));
            try {
              chartRef.current.timeScale().setVisibleLogicalRange({ from: newFromIdx, to: newToIdx });
            } catch {
              // ignore
            }
          }
          pendingLiveRangeRef.current = null;
        }

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

    onAlertTriggered: (alert) => setTriggeredAlert(alert),
  });

  // Use cached historical immediately on timeframe change
  useEffect(() => {
    if (!seriesRef.current) return;
    if (replayActive) return;
    try {
      const symbol = useChartStore.getState().symbol;
      const cached = getCachedHistorical ? getCachedHistorical(symbol, timeframe) : null;
      if (cached && cached.length) {
        const sorted = [...cached]
          .sort((a, b) => (a.time as number) - (b.time as number))
          .filter((value, index, array) => index === 0 || value.time !== array[index - 1].time);
        seriesRef.current.setData(sorted);
        requestAnimationFrame(() => bumpOverlayRedraw());
      }
    } catch {
      // ignore
    }
  }, [timeframe, getCachedHistorical, replayActive, bumpOverlayRedraw]);

  // Abort pending timeframe switch when starting a new one
  useEffect(() => {
    if (timeframeSwitchAbortRef.current) {
      timeframeSwitchAbortRef.current.abort();
    }
    timeframeSwitchAbortRef.current = new AbortController();
  }, [timeframe]);

  // Cancel playback loop on timeframe change
  useEffect(() => {
    if (timeframeSwitchCancelRef.current) {
      timeframeSwitchCancelRef.current.abort();
    }
    timeframeSwitchCancelRef.current = new AbortController();
  }, [timeframe]);

  // On timeframe change while replayActive
  useEffect(() => {
    if (!replayActive) return;
    
    if (lastTimeframeRef.current === timeframe) return;
    lastTimeframeRef.current = timeframe;

    const store = useChartStore.getState();
    const replay = store.replay || ({} as any);
    const startEpoch =
      typeof replay.startEpoch === 'number'
        ? Number(replay.startEpoch)
        : Array.isArray(replay.candles) && typeof replay.index === 'number'
        ? Number(replay.candles[replay.index]?.time)
        : undefined;

    if (!startEpoch) return;

    const signal = timeframeSwitchAbortRef.current?.signal;
    let cancelled = false;

    (async () => {
      try {
        const iso = new Date(startEpoch * 1000).toISOString();
        const loaded = await loadReplayCandles(iso);
        
        if (cancelled || signal?.aborted || !loaded || !loaded.length) {
          return;
        }

        const sorted = [...loaded]
          .map((c: any) => ({ ...c, time: Number(c.time) }))
          .sort((a, b) => a.time - b.time);

        const currentReplay = useChartStore.getState().replay as any;
        const currentIdx = currentReplay.index || 0;
        const currentCandle = currentReplay.candles?.[currentIdx];
        
        let mappedIdx = 0;
        if (currentCandle) {
          const foundIdx = sorted.findIndex(c => Number(c.time) === Number(currentCandle.time));
          if (foundIdx >= 0) {
            mappedIdx = foundIdx;
          } else {
            let lo = 0, hi = sorted.length - 1;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (sorted[mid].time < startEpoch) lo = mid + 1;
              else hi = mid;
            }
            mappedIdx = lo === 0 ? 0 : Math.abs(sorted[lo - 1].time - startEpoch) <= Math.abs(sorted[lo].time - startEpoch) ? lo - 1 : lo;
          }
        }

        if (!cancelled && !signal?.aborted) {
          setReplayState({
            candles: sorted,
            index: Math.max(0, Math.min(sorted.length - 1, mappedIdx)),
          });

          if (seriesRef.current) {
            try {
              seriesRef.current.setData(sorted.slice(0, Math.max(1, mappedIdx + 1)));
              requestAnimationFrame(() => bumpOverlayRedraw());
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore load errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timeframe, replayActive, loadReplayCandles, setReplayState, bumpOverlayRedraw]);

  // Main replay playback loop - read from store every cycle
  useEffect(() => {
    if (!replayActive || !seriesRef.current) return;

    const signal = timeframeSwitchCancelRef.current?.signal;
    if (signal?.aborted) return;

    // Get initial state from store
    const { replay } = useChartStore.getState();
    if (!replay.candles.length) return;

    try {
      seriesRef.current.setData(replay.candles.slice(0, replay.index + 1));
      requestAnimationFrame(() => bumpOverlayRedraw());
    } catch {
      // ignore
    }

    if (!replayPlaying) return;

    const interval = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(interval);
        return;
      }

      const currentState = useChartStore.getState().replay;
      if (!seriesRef.current || !currentState.active) {
        clearInterval(interval);
        return;
      }

      const nextIndex = currentState.index + 1;

      if (nextIndex >= currentState.candles.length) {
        clearInterval(interval);
        setReplayState({ playing: false });
        return;
      }

      try {
        seriesRef.current.setData(currentState.candles.slice(0, nextIndex + 1));
        requestAnimationFrame(() => bumpOverlayRedraw());
      } catch {
        // ignore
      }

      setReplayState({ index: nextIndex });
    }, replaySpeed);

    return () => {
      clearInterval(interval);
      if (replayTimerRef.current === interval) {
        replayTimerRef.current = null;
      }
    };
  }, [replayActive, replayPlaying, replaySpeed, setReplayState, bumpOverlayRedraw]);

  // Ensure replay has an absolute startEpoch when activated
  useEffect(() => {
    if (!replayActive) return;
    const store = useChartStore.getState();
    const replay = store.replay || ({} as any);
    if (typeof replay.startEpoch === 'number') return;

    const idx = typeof replay.index === 'number' ? replay.index : 0;
    const candles = Array.isArray(replay.candles) && replay.candles.length ? replay.candles : replayCandles;
    const t = candles?.[idx]?.time;
    if (t) {
      setReplayState({ startEpoch: Number(t) });
    }
  }, [replayActive, replayCandles, setReplayState]);

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
            series={seriesRef.current as unknown as ISeriesApi<'Candlestick', 'Time'>}
            redrawKey={overlayRedrawKey}
          />
        )}
      </div>

      {isReady && chartRef.current && seriesRef.current && (
        <>
          <DrawingSettingsPanel />
          <div className="absolute top-4 right-4 z-30">
            {React.createElement(RiskRewardTool as any, { chart: chartRef.current, series: seriesRef.current as unknown as ISeriesApi<'Candlestick', 'Time'> })}
          </div>
        </>
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