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
  const prevReplayActive = useRef(false);
  const prevTimeframe = useRef<string | null>(null);
  const prevReplayCandlesRef = useRef<CandleData[] | null>(null);
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

  // Ensure replay progress maps to new timeframe candles (prevent progress reset)
  useEffect(() => {
    if (!replayActive) {
      prevReplayCandlesRef.current = null;
      return;
    }
    // run only when replayCandles array reference changes (new TF loaded)
    if (prevReplayCandlesRef.current === replayCandles) return;
    prevReplayCandlesRef.current = replayCandles;

    if (!replayCandles || !replayCandles.length) return;

    const storeReplay = useChartStore.getState().replay as any;
    const startEpoch = typeof storeReplay.startEpoch === 'number' ? storeReplay.startEpoch : undefined;
    const startProgress = typeof storeReplay.startProgress === 'number' ? storeReplay.startProgress : undefined;
    const prevIdx = typeof storeReplay.index === 'number' ? storeReplay.index : undefined;
    const prevLen = Array.isArray(storeReplay.candles) ? storeReplay.candles.length : 0;

    let mappedIndex = 0;
    // Prefer aligning to absolute startEpoch if available
    if (typeof startEpoch === 'number') {
      const startIdx = replayCandles.findIndex(c => Number(c.time) >= startEpoch);
      if (startIdx >= 0) {
        mappedIndex = Math.max(0, Math.min(replayCandles.length - 1, startIdx));
      } else if (typeof startProgress === 'number') {
        mappedIndex = Math.round(startProgress * Math.max(0, replayCandles.length - 1));
      } else if (typeof prevIdx === 'number' && prevLen > 1) {
        // fallback: preserve relative progress ratio from previous TF
        const progress = prevLen > 1 ? prevIdx / (prevLen - 1) : 0;
        mappedIndex = Math.round(progress * Math.max(0, replayCandles.length - 1));
      } else {
        mappedIndex = Math.min(5, replayCandles.length - 1);
      }
    } else if (typeof startProgress === 'number') {
      mappedIndex = Math.round(startProgress * Math.max(0, replayCandles.length - 1));
    } else if (typeof prevIdx === 'number' && prevLen > 1) {
      const progress = prevLen > 1 ? prevIdx / (prevLen - 1) : 0;
      mappedIndex = Math.round(progress * Math.max(0, replayCandles.length - 1));
    } else {
      mappedIndex = Math.min(5, replayCandles.length - 1);
    }

    // Only update store if index actually differs (avoid loops)
    if (mappedIndex !== storeReplay.index || storeReplay.candles !== replayCandles) {
      setReplayState({
        ...storeReplay,
        candles: replayCandles,
        index: mappedIndex,
      });
    }
  // intentionally only depends on replayCandles and replayActive
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayCandles, replayActive]);

  // keep replay position as absolute time + index
  const replayRef = useRef<{ active: boolean; time: number | null; index: number | null }>({
    active: false,
    time: null,
    index: null,
  });

  // Helper: binary-search nearest bar index by time (assumes data[].time sorted ascending)
  function findClosestBarIndexByTime(data: { time: number }[], time: number) {
    if (!data || data.length === 0) return -1;
    let lo = 0;
    let hi = data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (data[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return 0;
    const a = data[lo - 1];
    const b = data[lo];
    return Math.abs(a.time - time) <= Math.abs(b.time - time) ? lo - 1 : lo;
  }

  // When starting playback, set replayRef.current = { active: true, time: startTime, index: startIndex }
  // When stopping: replayRef.current.active = false

  // On timeframe change -> map absolute replay time to new timeframe's data and keep position
  useEffect(() => {
    if (!replayRef.current.active || replayRef.current.time == null) return;

    const dataForFrame = getSeriesDataForTimeframe(timeframe); // <-- uses store/store helpers
    if (!dataForFrame || dataForFrame.length === 0) {
      // If no data available for this timeframe, keep replay time and request fetch for that timeframe
      requestDataForTimeframeAround(timeframe, replayRef.current.time);
      return;
    }

    // ensure everything compared in seconds
    const targetTimeSec = toSeconds(replayRef.current.time);
    const sampleTimeSec = toSeconds(Number(dataForFrame[0].time));
    const target = targetTimeSec; // both are seconds

    const idx = findClosestBarIndexByTime(dataForFrame, target);
    console.debug('replay mapping', {
      timeframe,
      requestedRaw: replayRef.current.time,
      requestedSec: targetTimeSec,
      sampleFirstRaw: dataForFrame[0].time,
      sampleFirstSec: sampleTimeSec,
      mappedIndex: idx,
      mappedTime: idx >= 0 ? dataForFrame[idx].time : null,
      dataLen: dataForFrame.length,
    });

    if (idx >= 0) {
      replayRef.current.index = idx;
      replayRef.current.time = toSeconds(Number(dataForFrame[idx].time));

      // Keep the same visible window size in bars (or compute based on current visible range)
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      const visibleBars = visibleRange ? Math.max(20, Math.floor((visibleRange.to ?? 40) - (visibleRange.from ?? 0))) : 50;
      const half = Math.floor(visibleBars / 2);
      const fromIndex = Math.max(0, idx - half);
      const toIndex = Math.min(dataForFrame.length - 1, idx + half);

      const fromTime = dataForFrame[fromIndex].time;
      const toTime = dataForFrame[toIndex].time;

      if (chartRef.current) {
        chartRef.current.timeScale().setVisibleRange({ from: fromTime as Time, to: toTime as Time });
      }

      setReplayIndex(idx);
    } else {
      requestDataForTimeframeAround(timeframe, replayRef.current.time);
    }
  }, [timeframe]);

  // convert any epoch-like value to seconds (stable unit across app)
  function toSeconds(epoch: number) {
    if (!Number.isFinite(epoch)) return epoch;
    return epoch > 1e12 ? Math.floor(epoch / 1000) : Math.floor(epoch);
  }

  useEffect(() => {
    if (!replayRef.current.active || replayRef.current.time == null) return;
    const dataForFrame = getSeriesDataForTimeframe(timeframe);
    if (!dataForFrame || dataForFrame.length === 0) {
      requestDataForTimeframeAround(timeframe, replayRef.current.time);
      return;
    }

    // ensure everything compared in seconds
    const targetTimeSec = toSeconds(replayRef.current.time);
    const sampleTimeSec = toSeconds(Number(dataForFrame[0].time));
    const target = targetTimeSec; // both are seconds

    const idx = findClosestBarIndexByTime(dataForFrame, target);
    console.debug('replay mapping', {
      timeframe,
      requestedRaw: replayRef.current.time,
      requestedSec: targetTimeSec,
      sampleFirstRaw: dataForFrame[0].time,
      sampleFirstSec: sampleTimeSec,
      mappedIndex: idx,
      mappedTime: idx >= 0 ? dataForFrame[idx].time : null,
      dataLen: dataForFrame.length,
    });

    if (idx >= 0) {
      replayRef.current.index = idx;
      replayRef.current.time = toSeconds(Number(dataForFrame[idx].time));
      // ... rest unchanged ...
    } else {
      requestDataForTimeframeAround(timeframe, replayRef.current.time);
    }
  }, [timeframe]);

  // Utility: normalizeTimeUnit(target, sample) -> make sure both match units (ms vs s)
  function normalizeTimeUnit(targetTime: number, sampleTime: number) {
    // sampleTime likely in seconds (<= 1e10) or ms (>1e12)
    // if sample is seconds but target is ms -> convert target to seconds
    if (sampleTime < 1e12 && targetTime > 1e12) return Math.floor(targetTime / 1000);
    // if sample is ms but target is seconds -> convert target to ms
    if (sampleTime > 1e12 && targetTime < 1e12) return targetTime * 1000;
    return targetTime;
  }

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

/* --------------------------------------------------------------------------
   Helper utilities placed at file bottom (do not reset replay state here)
   -------------------------------------------------------------------------- */

function requestDataForTimeframeAround(timeframe: number, time: number) {
  // Record the requested absolute start time in shared replay state so the loader
  // can fetch candles around that time. Do NOT clear existing candles/index/playing
  // so playback doesn't visually restart while loading.
  const store = useChartStore.getState();

  store.setReplayState({
    ...store.replay,
    startEpoch: time,
  });

  try {
    window.dispatchEvent(new CustomEvent('requestReplayCandles', { detail: { timeframe, time } }));
  } catch {
    // ignore in non-browser environments
  }
}

function setReplayIndex(idx: number) {
  const store = useChartStore.getState();
  const replay = store.replay || ({} as any);

  const maxIndex = Array.isArray(replay.candles) && replay.candles.length > 0
    ? replay.candles.length - 1
    : idx;

  const clamped = Math.max(0, Math.min(idx, maxIndex));

  store.setReplayState({
    ...replay,
    index: clamped,
  });

  try {
    window.dispatchEvent(new CustomEvent('replayIndexChanged', { detail: { index: clamped } }));
  } catch {
    // ignore in non-browser environments
  }
}

function getSeriesDataForTimeframe(timeframe: number): { time: number }[] {
  const store = useChartStore.getState();

  if (Array.isArray(store.replay?.candles) && store.timeframe === timeframe) {
    return store.replay.candles as { time: number }[];
  }

  const anyStore = store as any;
  if (anyStore.candlesByTimeframe && Array.isArray(anyStore.candlesByTimeframe[timeframe])) {
    return anyStore.candlesByTimeframe[timeframe] as { time: number }[];
  }

  const globalHolder = (window as any).__derivChartData;
  if (globalHolder && Array.isArray(globalHolder[timeframe])) {
    return globalHolder[timeframe] as { time: number }[];
  }

  try {
    window.dispatchEvent(new CustomEvent('requestReplayCandles', { detail: { timeframe, time: Date.now() } }));
  } catch {
    // ignore
  }

  return [];
}