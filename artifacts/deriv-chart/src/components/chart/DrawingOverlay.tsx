import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
import { useChartStore, Drawing, Point } from '../../store/use-chart-store';
import { v4 as uuidv4 } from 'uuid';

interface DrawingOverlayProps {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
}

export default function DrawingOverlay({ chart, series }: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs for values needed inside event handlers to avoid stale closures
  const activeToolRef = useRef(useChartStore.getState().activeTool);
  const drawingsRef = useRef<Drawing[]>(useChartStore.getState().drawings);
  const currentDrawIdRef = useRef<string | null>(null);

  // Subscribe to store changes and keep refs in sync
  useEffect(() => {
    const unsub = useChartStore.subscribe((state) => {
      activeToolRef.current = state.activeTool;
      drawingsRef.current = state.drawings;
    });
    return unsub;
  }, []);

  // Canvas resize — watch the container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sync = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      renderDrawings();
    };

    const obs = new ResizeObserver(sync);
    obs.observe(container);
    sync(); // initial size
    return () => obs.disconnect();
  }, []);

  // Render drawings on canvas
  const renderDrawings = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let priceScaleWidth = 0;
    try { priceScaleWidth = chart.priceScale('right').width(); } catch { /* chart disposed */ }
    const drawWidth = canvas.width - priceScaleWidth;

    const drawings = drawingsRef.current;
    drawings.forEach(d => {
      if (!d.points.length) return;

      ctx.beginPath();
      ctx.strokeStyle = d.color || '#2962FF';
      ctx.lineWidth = 2;

      if (d.type === 'trendline' && d.points.length >= 2) {
        const [p1, p2] = d.points;
        const x1 = chart.timeScale().timeToCoordinate(p1.time as any) ?? 0;
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        const x2 = chart.timeScale().timeToCoordinate(p2.time as any) ?? 0;
        const y2 = series.priceToCoordinate(p2.price) ?? 0;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      else if (d.type === 'ray' && d.points.length >= 2) {
        const [p1, p2] = d.points;
        const x1 = chart.timeScale().timeToCoordinate(p1.time as any) ?? 0;
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        const x2 = chart.timeScale().timeToCoordinate(p2.time as any) ?? 0;
        const y2 = series.priceToCoordinate(p2.price) ?? 0;
        // Extend to right edge
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx !== 0) {
          const t = (drawWidth - x1) / dx;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 + dx * t, y1 + dy * t);
        }
        ctx.stroke();
      }
      else if (d.type === 'hline' && d.points.length >= 1) {
        const y1 = series.priceToCoordinate(d.points[0].price) ?? 0;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(0, y1);
        ctx.lineTo(drawWidth, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        // Price label
        ctx.fillStyle = '#2962FF';
        ctx.font = '11px monospace';
        ctx.fillText(d.points[0].price.toFixed(4), drawWidth - 70, y1 - 4);
      }
      else if (d.type === 'rect' && d.points.length >= 2) {
        const [p1, p2] = d.points;
        const x1 = chart.timeScale().timeToCoordinate(p1.time as any) ?? 0;
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        const x2 = chart.timeScale().timeToCoordinate(p2.time as any) ?? 0;
        const y2 = series.priceToCoordinate(p2.price) ?? 0;
        ctx.fillStyle = 'rgba(41, 98, 255, 0.12)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      }
      else if (d.type === 'fib' && d.points.length >= 2) {
        const [p1, p2] = d.points;
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        const y2 = series.priceToCoordinate(p2.price) ?? 0;
        const x1 = chart.timeScale().timeToCoordinate(p1.time as any) ?? 0;
        const x2 = chart.timeScale().timeToCoordinate(p2.time as any) ?? 0;
        const levels = [
          { r: 0,     color: '#ef5350' },
          { r: 0.236, color: '#ff9800' },
          { r: 0.382, color: '#fdd835' },
          { r: 0.5,   color: '#26a69a' },
          { r: 0.618, color: '#26a69a' },
          { r: 0.786, color: '#42a5f5' },
          { r: 1,     color: '#ef5350' },
        ];
        const diff = y2 - y1;
        const startX = Math.min(x1, x2);
        levels.forEach(({ r, color }) => {
          const y = y1 + diff * r;
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.setLineDash([5, 4]);
          ctx.moveTo(startX, y);
          ctx.lineTo(drawWidth, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color;
          ctx.font = '10px monospace';
          const priceDiff = p2.price - p1.price;
          const priceAtLevel = p1.price + priceDiff * r;
          ctx.fillText(`${(r * 100).toFixed(1)}% — ${priceAtLevel.toFixed(4)}`, startX + 4, y - 3);
        });
      }
    });
  }, [chart, series]);

  // Subscribe to chart events to re-render drawings on pan/zoom
  useEffect(() => {
    chart.timeScale().subscribeVisibleTimeRangeChange(renderDrawings);
    chart.subscribeCrosshairMove(renderDrawings);
    renderDrawings();
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(renderDrawings);
      chart.unsubscribeCrosshairMove(renderDrawings);
    };
  }, [renderDrawings]);

  // Re-render whenever drawings change in the store
  useEffect(() => {
    return useChartStore.subscribe((state) => {
      drawingsRef.current = state.drawings;
      renderDrawings();
    });
  }, [renderDrawings]);

  // Event handlers — using refs so they never go stale
  useEffect(() => {
    const handleClick = (param: MouseEventParams) => {
      const tool = activeToolRef.current;
      if (tool === 'cursor') return;
      if (!param.time || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      const newPoint: Point = { time: param.time as number, price };

      if (!currentDrawIdRef.current) {
        // First click — start new drawing
        const id = uuidv4();
        currentDrawIdRef.current = id;
        useChartStore.getState().addDrawing({ id, type: tool, points: [newPoint] });

        // Single-click tools complete immediately
        if (tool === 'hline') {
          currentDrawIdRef.current = null;
          useChartStore.getState().setActiveTool('cursor');
        }
      } else {
        // Second click — complete the drawing
        const id = currentDrawIdRef.current;
        const existing = drawingsRef.current.find(d => d.id === id);
        if (existing) {
          useChartStore.getState().updateDrawing(id, { points: [...existing.points.slice(0, 1), newPoint] });
        }
        currentDrawIdRef.current = null;
        useChartStore.getState().setActiveTool('cursor');
      }
    };

    const handleMove = (param: MouseEventParams) => {
      const id = currentDrawIdRef.current;
      if (!id || !param.time || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      const existing = drawingsRef.current.find(d => d.id === id);
      if (!existing) return;

      const previewPoints = [existing.points[0], { time: param.time as number, price }];
      useChartStore.getState().updateDrawing(id, { points: previewPoints });
    };

    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleMove);
    return () => {
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleMove);
    };
  }, [chart, series]); // Only depends on chart/series, not state — refs handle the rest

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ display: 'block' }}
      />
    </div>
  );
}
