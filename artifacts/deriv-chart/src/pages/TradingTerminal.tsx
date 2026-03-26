import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import DrawingOverlay from './DrawingOverlay';
import { useChartStore } from '../../store/use-chart-store';

export interface ChartRef {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
}

interface LightweightChartProps {}

const LightweightChart = forwardRef<ChartRef, LightweightChartProps>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [redrawKey, setRedrawKey] = useState(0);

  const candleData = useChartStore((state: any) => state.candleData);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0f1419' },
        textColor: '#d1d5db',
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    if (candleData.length > 0) {
      series.setData(candleData);
      chart.timeScale().fitContent();
    }

    chartRef.current = chart;
    seriesRef.current = series;

    if (ref) {
      if (typeof ref === 'function') {
        ref({ chart, series });
      } else {
        ref.current = { chart, series };
      }
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [ref]);

  useEffect(() => {
    if (seriesRef.current && candleData.length > 0) {
      seriesRef.current.setData(candleData);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [candleData]);

  useEffect(() => {
    setRedrawKey((prev) => prev + 1);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {chartRef.current && seriesRef.current && (
        <DrawingOverlay
          chart={chartRef.current}
          series={seriesRef.current}
          redrawKey={redrawKey}
        />
      )}
    </div>
  );
});

LightweightChart.displayName = 'LightweightChart';

export default LightweightChart;