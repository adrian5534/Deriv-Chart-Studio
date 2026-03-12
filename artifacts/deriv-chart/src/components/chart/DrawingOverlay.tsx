import React, { useEffect, useRef, useState } from 'react';
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
  
  const activeTool = useChartStore(s => s.activeTool);
  const drawings = useChartStore(s => s.drawings);
  const addDrawing = useChartStore(s => s.addDrawing);
  const updateDrawing = useChartStore(s => s.updateDrawing);
  const setActiveTool = useChartStore(s => s.setActiveTool);

  const [currentDrawId, setCurrentDrawId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  // Sync canvas size with container
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          w: entry.contentRect.width,
          h: entry.contentRect.height
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Main render loop for canvas
  const renderDrawings = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Account for price scale width
    const priceScaleWidth = chart.priceScale('right').width();
    const timeScaleHeight = 26; // approx height
    
    // Render all stored drawings
    drawings.forEach(d => {
      ctx.beginPath();
      ctx.strokeStyle = d.color || '#2962FF';
      ctx.lineWidth = 2;

      if (d.type === 'trendline' && d.points.length >= 2) {
        const p1 = d.points[0];
        const p2 = d.points[1];
        
        const x1 = chart.timeScale().timeToCoordinate(p1.time as any) ?? 0;
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        const x2 = chart.timeScale().timeToCoordinate(p2.time as any) ?? 0;
        const y2 = series.priceToCoordinate(p2.price) ?? 0;

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      else if (d.type === 'hline' && d.points.length >= 1) {
        const p1 = d.points[0];
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        ctx.moveTo(0, y1);
        ctx.lineTo(canvas.width - priceScaleWidth, y1);
        ctx.stroke();
      }
      else if (d.type === 'rect' && d.points.length >= 2) {
        const p1 = d.points[0];
        const p2 = d.points[1];
        
        const x1 = chart.timeScale().timeToCoordinate(p1.time as any) ?? 0;
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        const x2 = chart.timeScale().timeToCoordinate(p2.time as any) ?? 0;
        const y2 = series.priceToCoordinate(p2.price) ?? 0;

        ctx.fillStyle = 'rgba(41, 98, 255, 0.2)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      }
      else if (d.type === 'fib' && d.points.length >= 2) {
        // Simplified Fib implementation
        const p1 = d.points[0];
        const p2 = d.points[1];
        const y1 = series.priceToCoordinate(p1.price) ?? 0;
        const y2 = series.priceToCoordinate(p2.price) ?? 0;
        const x1 = chart.timeScale().timeToCoordinate(p1.time as any) ?? 0;
        const x2 = chart.timeScale().timeToCoordinate(p2.time as any) ?? 0;
        
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const diff = y2 - y1;

        levels.forEach(lvl => {
          const y = y1 + (diff * lvl);
          ctx.beginPath();
          ctx.moveTo(Math.min(x1, x2), y);
          ctx.lineTo(canvas.width - priceScaleWidth, y);
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          ctx.fillStyle = '#787b86';
          ctx.font = '10px sans-serif';
          ctx.fillText(`${(lvl * 100).toFixed(1)}%`, canvas.width - priceScaleWidth - 40, y - 5);
        });
      }
    });
  };

  // Re-render when chart scrolls/zooms or drawings change
  useEffect(() => {
    chart.timeScale().subscribeVisibleTimeRangeChange(renderDrawings);
    chart.subscribeCrosshairMove(renderDrawings);
    renderDrawings();
    
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(renderDrawings);
      chart.unsubscribeCrosshairMove(renderDrawings);
    };
  }, [drawings, dimensions]);

  // Handle interaction via lightweight-charts event subscription
  useEffect(() => {
    if (activeTool === 'cursor') return;

    const handleClick = (param: MouseEventParams) => {
      if (!param.time || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (!price) return;

      const newPoint: Point = { time: param.time as number, price };

      if (!currentDrawId) {
        // Start new drawing
        const id = uuidv4();
        setCurrentDrawId(id);
        
        if (activeTool === 'hline') {
           addDrawing({ id, type: activeTool, points: [newPoint] });
           setCurrentDrawId(null);
           setActiveTool('cursor'); // Return to cursor immediately for 1-click tools
        } else {
           addDrawing({ id, type: activeTool, points: [newPoint] });
        }
      } else {
        // Complete drawing (2nd click for trendline, fib, rect)
        const d = drawings.find(x => x.id === currentDrawId);
        if (d) {
          updateDrawing(currentDrawId, { points: [...d.points, newPoint] });
        }
        setCurrentDrawId(null);
        setActiveTool('cursor');
      }
    };

    const handleMouseMove = (param: MouseEventParams) => {
      if (!currentDrawId || !param.time || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (!price) return;
      
      const d = drawings.find(x => x.id === currentDrawId);
      if (d && d.points.length === 1) {
        // Temporarily add 2nd point for visual preview
        updateDrawing(currentDrawId, { points: [d.points[0], { time: param.time as number, price }] });
      } else if (d && d.points.length > 1) {
         // Update the last point for preview
         const newPoints = [...d.points];
         newPoints[newPoints.length - 1] = { time: param.time as number, price };
         updateDrawing(currentDrawId, { points: newPoints });
      }
    };

    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleMouseMove);

    return () => {
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleMouseMove);
    };
  }, [activeTool, currentDrawId, drawings, chart, series]);

  return (
    <div ref={containerRef} className={`absolute inset-0 z-10 ${activeTool !== 'cursor' ? 'drawing-mode-active' : ''}`} style={{ pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        className="absolute inset-0 drawing-canvas"
      />
    </div>
  );
}
