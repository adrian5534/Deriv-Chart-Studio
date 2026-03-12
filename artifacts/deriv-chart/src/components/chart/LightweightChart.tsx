import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { useChartStore } from '../../store/use-chart-store';
import { useDerivWebSocket } from '../../hooks/use-deriv-websocket';
import DrawingOverlay from './DrawingOverlay';

export interface ChartRef {
  getChart: () => IChartApi | null;
  getSeries: () => ISeriesApi<"Candlestick"> | null;
}

const LightweightChart = forwardRef<ChartRef, {}>((_, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const timeframe = useChartStore(s => s.timeframe);

  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
    getSeries: () => seriesRef.current,
  }));

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'Solid' as const, color: '#0B0E14' },
        textColor: '#787b86',
      },
      grid: {
        vertLines: { color: '#222631' },
        horzLines: { color: '#222631' },
      },
      crosshair: {
        mode: 0, // Normal mode
        vertLine: { width: 1, color: '#787b86', style: 3 },
        horzLine: { width: 1, color: '#787b86', style: 3 },
      },
      timeScale: {
        borderColor: '#222631',
        timeVisible: true,
        secondsVisible: timeframe < 86400,
      },
      rightPriceScale: {
        borderColor: '#222631',
        autoScale: true,
      },
      autoSize: true,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    setIsReady(true);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setIsReady(false);
    };
  }, [timeframe]); // Re-create if timeframe changes drastically to reset timescale formats if needed, though usually not strictly required

  // Handle Data via WS
  useDerivWebSocket({
    onHistoricalData: (data) => {
      if (seriesRef.current) {
        // Ensure data is sorted
        const sorted = [...data].sort((a, b) => (a.time as number) - (b.time as number));
        // Remove duplicates just in case
        const unique = sorted.filter((v, i, a) => a.findIndex(t => (t.time === v.time)) === i);
        seriesRef.current.setData(unique);
      }
    },
    onLiveUpdate: (data) => {
      if (seriesRef.current) {
        seriesRef.current.update(data);
      }
    }
  });

  return (
    <div className="relative w-full h-full flex-1">
      <div ref={chartContainerRef} className="absolute inset-0" />
      {isReady && chartRef.current && seriesRef.current && (
        <DrawingOverlay chart={chartRef.current} series={seriesRef.current} />
      )}
    </div>
  );
});

LightweightChart.displayName = 'LightweightChart';
export default LightweightChart;
