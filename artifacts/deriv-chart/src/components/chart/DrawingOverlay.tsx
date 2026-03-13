import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
import { useChartStore, Drawing, Point } from '../../store/use-chart-store';
import { v4 as uuidv4 } from 'uuid';

interface DrawingOverlayProps {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
}

type DragHandleState = {
  drawingId: string;
  pointIndex: number;
} | null;

const HANDLE_RADIUS = 5;
const HIT_DISTANCE = 10;

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return distance(px, py, x1, y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;

  return distance(px, py, cx, cy);
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '').trim();

  if (normalized.length !== 6) {
    return `rgba(41, 98, 255, ${alpha})`;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function DrawingOverlay({ chart, series }: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeToolRef = useRef(useChartStore.getState().activeTool);
  const drawingsRef = useRef<Drawing[]>(useChartStore.getState().drawings);
  const currentDrawIdRef = useRef<string | null>(null);
  const selectedDrawingIdRef = useRef<string | null>(null);
  const hoveredDrawingIdRef = useRef<string | null>(null);

  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<DragHandleState>(null);
  const [, forceRefresh] = useState(0);

  const syncSelection = useCallback((id: string | null) => {
    selectedDrawingIdRef.current = id;
    setSelectedDrawingId(id);
  }, []);

  const bumpOverlay = useCallback(() => {
    forceRefresh((v) => v + 1);
  }, []);

  const getCanvasBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    return container.getBoundingClientRect();
  }, []);

  const projectPoint = useCallback((point: Point) => {
    const x = chart.timeScale().timeToCoordinate(point.time as any);
    const y = series.priceToCoordinate(point.price);

    if (x == null || y == null) return null;

    return { x, y };
  }, [chart, series]);

  const getCanvasPointFromClient = useCallback((clientX: number, clientY: number) => {
    const bounds = getCanvasBounds();
    if (!bounds) return null;

    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
  }, [getCanvasBounds]);

  const toChartPoint = useCallback((x: number, y: number): Point | null => {
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time == null || price == null || typeof time !== 'number') {
      return null;
    }

    return { time, price };
  }, [chart, series]);

  const drawWidth = useCallback((canvas: HTMLCanvasElement) => {
    let priceScaleWidth = 0;
    try {
      priceScaleWidth = chart.priceScale('right').width();
    } catch {
      priceScaleWidth = 0;
    }
    return canvas.clientWidth - priceScaleWidth;
  }, [chart]);

  const findHandleAt = useCallback((x: number, y: number) => {
    const drawings = [...drawingsRef.current].reverse();

    for (const drawing of drawings) {
      for (let i = drawing.points.length - 1; i >= 0; i -= 1) {
        const coords = projectPoint(drawing.points[i]);
        if (!coords) continue;

        if (distance(x, y, coords.x, coords.y) <= HANDLE_RADIUS + HIT_DISTANCE) {
          return { drawingId: drawing.id, pointIndex: i };
        }
      }
    }

    return null;
  }, [projectPoint]);

  const findDrawingAt = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const maxX = drawWidth(canvas);
    const drawings = [...drawingsRef.current].reverse();

    for (const drawing of drawings) {
      if (drawing.points.length === 0) continue;

      if (drawing.type === 'hline' && drawing.points.length >= 1) {
        const y1 = series.priceToCoordinate(drawing.points[0].price);
        if (y1 != null && Math.abs(y - y1) <= HIT_DISTANCE) {
          return drawing.id;
        }
      }

      if ((drawing.type === 'trendline' || drawing.type === 'ray') && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);
        if (!p1 || !p2) continue;

        if (drawing.type === 'trendline') {
          if (distanceToSegment(x, y, p1.x, p1.y, p2.x, p2.y) <= HIT_DISTANCE) {
            return drawing.id;
          }
        } else {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const xEnd = dx === 0 ? p2.x : maxX;
          const yEnd = dx === 0 ? maxX : p1.y + ((xEnd - p1.x) / dx) * dy;

          if (distanceToSegment(x, y, p1.x, p1.y, xEnd, yEnd) <= HIT_DISTANCE) {
            return drawing.id;
          }
        }
      }

      if (drawing.type === 'rect' && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);
        if (!p1 || !p2) continue;

        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);

        const inside =
          x >= left - HIT_DISTANCE &&
          x <= right + HIT_DISTANCE &&
          y >= top - HIT_DISTANCE &&
          y <= bottom + HIT_DISTANCE;

        if (inside) {
          return drawing.id;
        }
      }

      if (drawing.type === 'fib' && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);
        if (!p1 || !p2) continue;

        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const diff = p2.y - p1.y;
        const startX = Math.min(p1.x, p2.x);

        for (const level of levels) {
          const levelY = p1.y + diff * level;
          const nearLine =
            x >= startX - HIT_DISTANCE &&
            x <= maxX + HIT_DISTANCE &&
            Math.abs(y - levelY) <= HIT_DISTANCE;

          if (nearLine) {
            return drawing.id;
          }
        }
      }
    }

    return null;
  }, [drawWidth, projectPoint, series]);

  const renderDrawings = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) return;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const maxX = drawWidth(canvas);

    drawingsRef.current.forEach((drawing) => {
      if (!drawing.points.length) return;

      const color = drawing.color || '#2962FF';
      const isSelected = drawing.id === selectedDrawingIdRef.current;
      const isHovered = drawing.id === hoveredDrawingIdRef.current;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2.25 : 2;

      if (drawing.type === 'trendline' && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      } else if (drawing.type === 'ray' && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);
        if (p1 && p2) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);

          if (dx === 0) {
            const yEnd = dy >= 0 ? height : 0;
            ctx.lineTo(p1.x, yEnd);
          } else {
            const xEnd = maxX;
            const yEnd = p1.y + ((xEnd - p1.x) / dx) * dy;
            ctx.lineTo(xEnd, yEnd);
          }

          ctx.stroke();
        }
      } else if (drawing.type === 'hline' && drawing.points.length >= 1) {
        const y1 = series.priceToCoordinate(drawing.points[0].price);
        if (y1 != null) {
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.moveTo(0, y1);
          ctx.lineTo(maxX, y1);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = color;
          ctx.font = '11px monospace';
          ctx.fillText(drawing.points[0].price.toFixed(4), Math.max(8, maxX - 90), y1 - 6);
        }
      } else if (drawing.type === 'rect' && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);
        if (p1 && p2) {
          const left = Math.min(p1.x, p2.x);
          const top = Math.min(p1.y, p2.y);
          const rectWidth = Math.abs(p2.x - p1.x);
          const rectHeight = Math.abs(p2.y - p1.y);

          ctx.fillStyle = hexToRgba(color, 0.12);
          ctx.fillRect(left, top, rectWidth, rectHeight);
          ctx.strokeRect(left, top, rectWidth, rectHeight);
        }
      } else if (drawing.type === 'fib' && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);
        if (p1 && p2) {
          const levels = [
            { r: 0, color: '#ef5350' },
            { r: 0.236, color: '#ff9800' },
            { r: 0.382, color: '#fdd835' },
            { r: 0.5, color: '#26a69a' },
            { r: 0.618, color: '#26a69a' },
            { r: 0.786, color: '#42a5f5' },
            { r: 1, color: '#ef5350' },
          ];

          const diff = p2.y - p1.y;
          const startX = Math.min(p1.x, p2.x);
          const priceDiff = drawing.points[1].price - drawing.points[0].price;

          levels.forEach(({ r, color: levelColor }) => {
            const y = p1.y + diff * r;
            const priceAtLevel = drawing.points[0].price + priceDiff * r;

            ctx.beginPath();
            ctx.strokeStyle = levelColor;
            ctx.setLineDash([5, 4]);
            ctx.moveTo(startX, y);
            ctx.lineTo(maxX, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = levelColor;
            ctx.font = '10px monospace';
            ctx.fillText(`${(r * 100).toFixed(1)}% — ${priceAtLevel.toFixed(4)}`, startX + 4, y - 4);
          });
        }
      }

      if (isSelected || isHovered) {
        drawing.points.forEach((point) => {
          const coords = projectPoint(point);
          if (!coords) return;

          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.arc(coords.x, coords.y, HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }

      ctx.restore();
    });
  }, [drawWidth, projectPoint, series]);

  const selectedHandles = useMemo(() => {
    if (!selectedDrawingId) return [];

    const drawing = drawingsRef.current.find((item) => item.id === selectedDrawingId);
    if (!drawing) return [];

    return drawing.points
      .map((point, pointIndex) => {
        const coords = projectPoint(point);
        if (!coords) return null;

        return {
          drawingId: drawing.id,
          pointIndex,
          x: coords.x,
          y: coords.y,
          color: drawing.color || '#2962FF',
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [projectPoint, selectedDrawingId, drawingsRef.current]);

  useEffect(() => {
    const unsubscribe = useChartStore.subscribe((state) => {
      activeToolRef.current = state.activeTool;
      drawingsRef.current = state.drawings;

      if (
        selectedDrawingIdRef.current &&
        !state.drawings.some((drawing) => drawing.id === selectedDrawingIdRef.current)
      ) {
        syncSelection(null);
      }

      if (
        currentDrawIdRef.current &&
        !state.drawings.some((drawing) => drawing.id === currentDrawIdRef.current)
      ) {
        currentDrawIdRef.current = null;
      }

      renderDrawings();
      bumpOverlay();
    });

    return unsubscribe;
  }, [bumpOverlay, renderDrawings, syncSelection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => {
      renderDrawings();
      bumpOverlay();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => observer.disconnect();
  }, [bumpOverlay, renderDrawings]);

  useEffect(() => {
    const handleChartClick = (param: MouseEventParams) => {
      if (!param.point) return;

      const tool = activeToolRef.current;

      if (tool === 'cursor') {
        const handleHit = findHandleAt(param.point.x, param.point.y);
        if (handleHit) {
          syncSelection(handleHit.drawingId);
          renderDrawings();
          bumpOverlay();
          return;
        }

        const drawingHit = findDrawingAt(param.point.x, param.point.y);
        syncSelection(drawingHit);
        renderDrawings();
        bumpOverlay();
        return;
      }

      if (!param.time) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;

      const newPoint: Point = { time: param.time as number, price };

      if (!currentDrawIdRef.current) {
        const id = uuidv4();
        currentDrawIdRef.current = id;
        syncSelection(id);

        useChartStore.getState().addDrawing({
          id,
          type: tool,
          points: [newPoint],
        });

        if (tool === 'hline') {
          currentDrawIdRef.current = null;
          useChartStore.getState().setActiveTool('cursor');
        }

        return;
      }

      const id = currentDrawIdRef.current;
      const existing = drawingsRef.current.find((drawing) => drawing.id === id);

      if (existing) {
        useChartStore.getState().updateDrawing(id, {
          points: [...existing.points.slice(0, 1), newPoint],
        });
      }

      currentDrawIdRef.current = null;
      syncSelection(id);
      useChartStore.getState().setActiveTool('cursor');
    };

    const handleCrosshairMove = (param: MouseEventParams) => {
      const tool = activeToolRef.current;

      if (tool !== 'cursor') {
        const id = currentDrawIdRef.current;
        if (!id || !param.point || !param.time) return;

        const price = series.coordinateToPrice(param.point.y);
        if (price == null) return;

        const existing = drawingsRef.current.find((drawing) => drawing.id === id);
        if (!existing || existing.points.length === 0) return;

        useChartStore.getState().updateDrawing(id, {
          points: [existing.points[0], { time: param.time as number, price }],
        });

        return;
      }

      if (draggingHandle) return;
      if (!param.point) return;

      const drawingHit =
        findHandleAt(param.point.x, param.point.y)?.drawingId ??
        findDrawingAt(param.point.x, param.point.y);

      if (hoveredDrawingIdRef.current !== drawingHit) {
        hoveredDrawingIdRef.current = drawingHit;
        renderDrawings();
      }
    };

    chart.subscribeClick(handleChartClick);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.timeScale().subscribeVisibleTimeRangeChange(renderDrawings);

    renderDrawings();

    return () => {
      chart.unsubscribeClick(handleChartClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(renderDrawings);
    };
  }, [
    bumpOverlay,
    chart,
    draggingHandle,
    findDrawingAt,
    findHandleAt,
    renderDrawings,
    series,
    syncSelection,
  ]);

  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (event: PointerEvent) => {
      const canvasPoint = getCanvasPointFromClient(event.clientX, event.clientY);
      if (!canvasPoint) return;

      const nextPoint = toChartPoint(canvasPoint.x, canvasPoint.y);
      if (!nextPoint) return;

      const drawing = drawingsRef.current.find((item) => item.id === draggingHandle.drawingId);
      if (!drawing) return;

      const nextPoints = drawing.points.map((point, index) =>
        index === draggingHandle.pointIndex ? nextPoint : point,
      );

      useChartStore.getState().updateDrawing(draggingHandle.drawingId, {
        points: nextPoints,
      });
    };

    const stopDragging = () => {
      setDraggingHandle(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [draggingHandle, getCanvasPointFromClient, toChartPoint]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && currentDrawIdRef.current) {
        useChartStore.getState().removeDrawing(currentDrawIdRef.current);
        currentDrawIdRef.current = null;
        useChartStore.getState().setActiveTool('cursor');
        renderDrawings();
        bumpOverlay();
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedDrawingIdRef.current &&
        activeToolRef.current === 'cursor'
      ) {
        useChartStore.getState().removeDrawing(selectedDrawingIdRef.current);
        syncSelection(null);
        renderDrawings();
        bumpOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bumpOverlay, renderDrawings, syncSelection]);

  const startHandleDrag = (drawingId: string, pointIndex: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    syncSelection(drawingId);
    setDraggingHandle({ drawingId, pointIndex });
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
      />

      <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
        {selectedHandles.map((handle) => (
          <button
            key={`${handle.drawingId}-${handle.pointIndex}`}
            type="button"
            aria-label={`Move drawing point ${handle.pointIndex + 1}`}
            onPointerDown={startHandleDrag(handle.drawingId, handle.pointIndex)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="absolute rounded-full border-2 bg-white shadow-sm"
            style={{
              left: handle.x - 7,
              top: handle.y - 7,
              width: 14,
              height: 14,
              borderColor: handle.color,
              pointerEvents: 'auto',
              cursor: 'grab',
            }}
          />
        ))}
      </div>
    </div>
  );
}