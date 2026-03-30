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

  const [isReady, setIsReady] = useState(false);
  const [overlayRedrawKey, setOverlayRedrawKey] = useState(0);
  const [triggeredAlert, setTriggeredAlert] = useState<{ symbol: string; price: number; condition: string } | null>(null);

  // --- Multi-timeframe replay alignment ---
  const [pendingRange, setPendingRange] = useState<{from: number, to: number} | null>(null);
  const pendingLiveRangeRef = useRef<{ from: number; to: number; width: number } | null>(null);
  const prevReplayActive = useRef(false);
  const prevTimeframe = useRef<string | null>(null);
  const prevReplayCandlesRef = useRef<CandleData[] | null>(null);
  const isTimeframeSwitchingRef = useRef(false);
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

  // Capture visible timestamps before timeframe changes in live mode so we can reapply after new data
  useEffect(() => {
    if (replayActive) return; // replay handles its own mapping
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
          // store both timestamps and the visible logical width so we restore bar-count/scroll
          const width = Math.max(1, toIdx - fromIdx);
          pendingLiveRangeRef.current = { from: Number(fromTime), to: Number(toTime), width };
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

  // get both loadReplayCandles and cached getter from websocket hook
  const { loadReplayCandles, getCachedHistorical } = useDerivWebSocket({
    onHistoricalData: (data) => {
      if (!seriesRef.current) return;
      if (useChartStore.getState().replay.active) return;

      const sorted = [...data]
        .sort((a, b) => (a.time as number) - (b.time as number))
        .filter((value, index, array) => index === 0 || value.time !== array[index - 1].time);

      try {
        seriesRef.current.setData(sorted);

        // If we captured a live pending range for this TF switch, map timestamps -> new logical indices and restore visible range
        if (pendingLiveRangeRef.current && chartRef.current) {
          const { from, width } = pendingLiveRangeRef.current;
          // find the new starting index for the saved 'from' timestamp
          const newFromIdx = sorted.findIndex(bar => Number(bar.time) >= from);
          if (newFromIdx !== -1) {
            const newToIdx = Math.min(sorted.length - 1, newFromIdx + Math.max(1, width));
            try {
              chartRef.current.timeScale().setVisibleLogicalRange({ from: newFromIdx, to: newToIdx });
            } catch {
              // ignore setVisibleLogicalRange errors
            }
          }
          // clear pending regardless — if mapping failed we'll fallback to default behaviour
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

  // Use cached historical immediately on timeframe change to avoid blank reload
  useEffect(() => {
    if (!seriesRef.current) return;
    if (replayActive) return; // don't replace data during replay
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

  // On timeframe change while replayActive
  useEffect(() => {
    if (!replayActive) return;
    const store = useChartStore.getState();
    const replay = store.replay || ({} as any);
    const startEpoch =
      typeof replay.startEpoch === 'number'
        ? Number(replay.startEpoch)
        : Array.isArray(replay.candles) && typeof replay.index === 'number'
        ? Number(replay.candles[replay.index]?.time)
        : undefined;

    if (!startEpoch) return;

    isTimeframeSwitchingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const iso = new Date(startEpoch * 1000).toISOString();
        const loaded = await loadReplayCandles(iso);
        if (cancelled || !loaded || !loaded.length) return;

        const sorted = [...loaded].map((c: any) => ({ ...c, time: Number(c.time) })).sort((a, b) => a.time - b.time);

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

        setReplayState({
          ...replay,
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
      } catch {
        // ignore
      } finally {
        isTimeframeSwitchingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      isTimeframeSwitchingRef.current = false;
    };
  }, [timeframe, replayActive, loadReplayCandles, setReplayState, bumpOverlayRedraw]);

  // Main replay playback loop (skip if mid-timeframe-switch)
  useEffect(() => {
    if (isTimeframeSwitchingRef.current) return; // Don't interfere during TF switch

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

  // Ensure replay has an absolute startEpoch when activated (do not reset existing playback)
  useEffect(() => {
    if (!replayActive) return;
    const store = useChartStore.getState();
    const replay = store.replay || ({} as any);
    // already set -> nothing to do
    if (typeof replay.startEpoch === 'number') return;

    const idx = typeof replay.index === 'number' ? replay.index : 0;
    const candles = Array.isArray(replay.candles) && replay.candles.length ? replay.candles : replayCandles;
    const t = candles?.[idx]?.time;
    if (t) {
      setReplayState({ ...replay, startEpoch: Number(t) });
    }
  }, [replayActive, replayCandles, setReplayState]);

  // On timeframe change while replayActive: fetch/map candles around the saved startEpoch and update store WITHOUT stopping playback
  useEffect(() => {
    if (!replayActive) return;
    const store = useChartStore.getState();
    const replay = store.replay || ({} as any);
    const startEpoch =
      typeof replay.startEpoch === 'number'
        ? Number(replay.startEpoch)
        : Array.isArray(replay.candles) && typeof replay.index === 'number'
        ? Number(replay.candles[replay.index]?.time)
        : undefined;

    if (!startEpoch) return;

    isTimeframeSwitchingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const iso = new Date(startEpoch * 1000).toISOString();
        const loaded = await loadReplayCandles(iso);
        if (cancelled || !loaded || !loaded.length) return;

        const sorted = [...loaded].map((c: any) => ({ ...c, time: Number(c.time) })).sort((a, b) => a.time - b.time);

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

        setReplayState({
          ...replay,
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
      } catch {
        // ignore
      } finally {
        isTimeframeSwitchingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      isTimeframeSwitchingRef.current = false;
    };
  }, [timeframe, replayActive, loadReplayCandles, setReplayState, bumpOverlayRedraw]);

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