import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IChartApi, ISeriesApi, MouseEventParams, type Logical } from 'lightweight-charts';
import {
  useChartStore,
  Drawing,
  Point,
  DrawingLineStyle,
  FibLabelMode,
  DrawingLabelHorizontalAlign,
  DrawingLabelVerticalAlign,
} from '../../store/use-chart-store';
import { v4 as uuidv4 } from 'uuid';

interface DrawingOverlayProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  redrawKey: number;
}

type DragHandleState = {
  drawingId: string;
  pointIndex: number;
} | null;

type DragDrawingState = {
  drawingId: string;
  startLogical: number;
  startPrice: number;
  originalPoints: Point[];
} | null;

const HANDLE_RADIUS = 5;
const HIT_DISTANCE = 10;

const DEFAULT_FIB_LEVELS = [
  { value: 0, label: '0.0%', color: '#ef5350', visible: true, lineStyle: 'solid' as DrawingLineStyle },
  { value: 0.236, label: '23.6%', color: '#ff9800', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.382, label: '38.2%', color: '#fdd835', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.5, label: '50.0%', color: '#26a69a', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.618, label: '61.8%', color: '#26a69a', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.786, label: '78.6%', color: '#42a5f5', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 1, label: '100.0%', color: '#ef5350', visible: true, lineStyle: 'solid' as DrawingLineStyle },
];

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

function applyLineStyle(ctx: CanvasRenderingContext2D, lineStyle: DrawingLineStyle) {
  switch (lineStyle) {
    case 'dashed':
      ctx.setLineDash([8, 6]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 5]);
      break;
    default:
      ctx.setLineDash([]);
      break;
  }
}

function getVisibleFibLevels(drawing: Drawing) {
  const configured = (drawing as any).fibLevels?.filter((level: any) => level.visible !== false);
  return configured?.length ? configured : DEFAULT_FIB_LEVELS;
}

function getHorizontalLabelX(
  startX: number,
  endX: number,
  align: DrawingLabelHorizontalAlign,
) {
  if (align === 'left') return startX + 6;
  if (align === 'center') return (startX + endX) / 2;
  return endX - 6;
}

function getVerticalLabelY(y: number, align: DrawingLabelVerticalAlign) {
  if (align === 'top') return y - 6;
  if (align === 'middle') return y;
  return y + 6;
}

function getVerticalTextBaseline(align: DrawingLabelVerticalAlign): CanvasTextBaseline {
  if (align === 'top') return 'bottom';
  if (align === 'middle') return 'middle';
  return 'top';
}

function drawTextLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  startX: number,
  endX: number,
  y: number,
  color: string,
  horizontalAlign: DrawingLabelHorizontalAlign,
  verticalAlign: DrawingLabelVerticalAlign,
) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = '10px monospace';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.lineWidth = 3;
  ctx.textAlign = horizontalAlign === 'center' ? 'center' : horizontalAlign;
  ctx.textBaseline = getVerticalTextBaseline(verticalAlign);

  const labelX = getHorizontalLabelX(startX, endX, horizontalAlign);
  const labelY = getVerticalLabelY(y, verticalAlign);

  ctx.strokeText(text, labelX, labelY);
  ctx.fillText(text, labelX, labelY);
  ctx.restore();
}

export default function DrawingOverlay({ chart, series, redrawKey }: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeTool = useChartStore((state) => state.activeTool);
  const drawings = useChartStore((state) => state.drawings);
  const selectedDrawingId = useChartStore((state) => state.selectedDrawingId);
  const timeframe = useChartStore((state) => state.timeframe);

  const activeToolRef = useRef(activeTool);
  const drawingsRef = useRef<Drawing[]>(drawings);
  const currentDrawIdRef = useRef<string | null>(null);
  const selectedDrawingIdRef = useRef<string | null>(selectedDrawingId);
  const hoveredDrawingIdRef = useRef<string | null>(null);
  const suppressNextClickRef = useRef(false);

  const [draggingHandle, setDraggingHandle] = useState<DragHandleState>(null);
  const [draggingDrawing, setDraggingDrawing] = useState<DragDrawingState>(null);
  const [overlayTick, forceRefresh] = useState(0);

  const syncSelection = useCallback((id: string | null) => {
    selectedDrawingIdRef.current = id;
    useChartStore.getState().setSelectedDrawingId(id);
  }, []);

  const bumpOverlay = useCallback(() => {
    forceRefresh((value) => value + 1);
  }, []);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    drawingsRef.current = drawings;

    if (
      selectedDrawingIdRef.current &&
      !drawings.some((drawing) => drawing.id === selectedDrawingIdRef.current)
    ) {
      selectedDrawingIdRef.current = null;
    }

    if (
      currentDrawIdRef.current &&
      !drawings.some((drawing) => drawing.id === currentDrawIdRef.current)
    ) {
      currentDrawIdRef.current = null;
    }
  }, [drawings]);

  useEffect(() => {
    selectedDrawingIdRef.current = selectedDrawingId;
  }, [selectedDrawingId]);

  const getCanvasBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    return container.getBoundingClientRect();
  }, []);

  const isDrawingVisibleOnTimeframe = useCallback((drawing: Drawing) => {
    if (drawing.visibleTimeframes == null) {
      return true;
    }

    if (drawing.visibleTimeframes.length === 0) {
      return false;
    }

    return drawing.visibleTimeframes.includes(timeframe);
  }, [timeframe]);

  const getPointLogical = useCallback((point: Point) => {
    if (typeof point.logical === 'number') {
      return point.logical;
    }

    const x = chart.timeScale().timeToCoordinate(point.time as never);
    if (x == null) return null;

    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical == null) return null;

    return Number(logical);
  }, [chart]);

  const projectPoint = useCallback((point: Point) => {
    const xFromTime = chart.timeScale().timeToCoordinate(point.time as never);
    const x =
      xFromTime ??
      (typeof point.logical === 'number'
        ? chart.timeScale().logicalToCoordinate(point.logical as Logical)
        : null);

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

  const toChartPoint = useCallback((x: number, y: number, referencePoint?: Point | null): Point | null => {
    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);

    if (logical == null || price == null) {
      return null;
    }

    const nextLogical = Number(logical);
    const directTime = chart.timeScale().coordinateToTime(x);

    if (typeof directTime === 'number') {
      return {
        time: directTime,
        price,
        logical: nextLogical,
      };
    }

    if (!referencePoint) {
      return null;
    }

    const referenceLogical = getPointLogical(referencePoint);
    if (referenceLogical == null) {
      return null;
    }

    return {
      time: referencePoint.time + Math.round((nextLogical - referenceLogical) * timeframe),
      price,
      logical: nextLogical,
    };
  }, [chart, getPointLogical, series, timeframe]);

  const toLogicalPricePoint = useCallback((x: number, y: number) => {
    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);

    if (logical == null || price == null) {
      return null;
    }

    return {
      logical: Number(logical),
      price,
    };
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
    const items = [...drawingsRef.current].reverse();

    for (const drawing of items) {
      if (drawing.locked || !isDrawingVisibleOnTimeframe(drawing)) continue;

      for (let i = drawing.points.length - 1; i >= 0; i -= 1) {
        const coords = projectPoint(drawing.points[i]);
        if (!coords) continue;

        if (distance(x, y, coords.x, coords.y) <= HANDLE_RADIUS + HIT_DISTANCE) {
          return { drawingId: drawing.id, pointIndex: i };
        }
      }
    }

    return null;
  }, [isDrawingVisibleOnTimeframe, projectPoint]);

  const findDrawingAt = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const items = [...drawingsRef.current].reverse();
    const maxX = drawWidth(canvas);
    const height = canvas.clientHeight;

    for (const drawing of items) {
      if (!isDrawingVisibleOnTimeframe(drawing) || drawing.points.length === 0) continue;

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
          const yEnd =
            dx === 0
              ? (dy >= 0 ? height : 0)
              : p1.y + ((xEnd - p1.x) / dx) * dy;

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

        const nearEdge =
          distanceToSegment(x, y, left, top, right, top) <= HIT_DISTANCE ||
          distanceToSegment(x, y, right, top, right, bottom) <= HIT_DISTANCE ||
          distanceToSegment(x, y, right, bottom, left, bottom) <= HIT_DISTANCE ||
          distanceToSegment(x, y, left, bottom, left, top) <= HIT_DISTANCE;

        const inside =
          x >= left - HIT_DISTANCE &&
          x <= right + HIT_DISTANCE &&
          y >= top - HIT_DISTANCE &&
          y <= bottom + HIT_DISTANCE;

        if (nearEdge || inside) {
          return drawing.id;
        }
      }

      if (drawing.type === 'fib' && drawing.points.length >= 2) {
        const fibReverse = (drawing as any).fibReverse ?? false;
        const fibExtendLeft = (drawing as any).fibExtendLeft ?? false;
        const fibExtendRight = (drawing as any).fibExtendRight ?? true;

        const fromPoint = fibReverse ? drawing.points[1] : drawing.points[0];
        const toPoint = fibReverse ? drawing.points[0] : drawing.points[1];
        const p1 = projectPoint(fromPoint);
        const p2 = projectPoint(toPoint);
        if (!p1 || !p2) continue;

        const levels = getVisibleFibLevels(drawing);
        const diff = p2.y - p1.y;
        const minX = Math.min(p1.x, p2.x);
        const maxAnchorX = Math.max(p1.x, p2.x);
        const lineStartX = fibExtendLeft ? 0 : minX;
        const lineEndX = fibExtendRight === false ? maxAnchorX : maxX;

        for (const level of levels) {
          const levelY = p1.y + diff * level.value;
          const nearLine =
            x >= lineStartX - HIT_DISTANCE &&
            x <= lineEndX + HIT_DISTANCE &&
            Math.abs(y - levelY) <= HIT_DISTANCE;

          if (nearLine) {
            return drawing.id;
          }
        }
      } else if (drawing.type === 'rr' && drawing.points.length >= 2) {
        // Risk:Reward hit detection (no canvas drawing here)
        const entryPoint = drawing.points[0];
        const stopPoint = drawing.points[1];
        const rrMultiplier = drawing.rrMultiplier ?? 1;

        const pEntry = projectPoint(entryPoint);
        const pStop = projectPoint(stopPoint);
        if (pEntry && pStop) {
          // compute default target price using multiplier:
          const entryPrice = entryPoint.price;
          const stopPrice = stopPoint.price;
          const targetPrice = entryPrice + (entryPrice - stopPrice) * rrMultiplier;

          const yEntry = pEntry.y;
          const yStop = pStop.y;
          const targetY = series.priceToCoordinate(targetPrice);

          // check proximity to entry/stop/target lines
          if (Math.abs(y - yEntry) <= HIT_DISTANCE || Math.abs(y - yStop) <= HIT_DISTANCE) {
            return drawing.id;
          }

          if (targetY != null && Math.abs(y - targetY) <= HIT_DISTANCE) {
            return drawing.id;
          }

          // check if inside the red risk area between entry and stop
          const redTop = Math.min(yEntry, yStop);
          const redBottom = Math.max(yEntry, yStop);
          if (y >= redTop - HIT_DISTANCE && y <= redBottom + HIT_DISTANCE) {
            return drawing.id;
          }
        }
      }
    }

    return null;
  }, [drawWidth, isDrawingVisibleOnTimeframe, projectPoint, series]);

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
      if (!drawing.points.length || !isDrawingVisibleOnTimeframe(drawing)) return;

      const color = drawing.color || '#2962FF';
      const isSelected = drawing.id === selectedDrawingIdRef.current;
      const isHovered = drawing.id === hoveredDrawingIdRef.current;
      const baseLineWidth = drawing.lineWidth || 2;
      const showPriceLabels = drawing.showPriceLabels ?? drawing.type === 'hline';
      const labelHorizontalAlign = drawing.labelHorizontalAlign ?? 'right';
      const labelVerticalAlign = drawing.labelVerticalAlign ?? 'top';
      const fibLabelMode: FibLabelMode = drawing.fibLabelMode ?? 'percent';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? baseLineWidth + 0.5 : isHovered ? baseLineWidth + 0.25 : baseLineWidth;
      applyLineStyle(ctx, drawing.lineStyle || 'solid');

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
          ctx.moveTo(0, y1);
          ctx.lineTo(maxX, y1);
          ctx.stroke();

          if (showPriceLabels) {
            drawTextLabel(
              ctx,
              drawing.points[0].price.toFixed(4),
              0,
              maxX,
              y1,
              color,
              labelHorizontalAlign,
              labelVerticalAlign,
            );
          }
        }
      } else if (drawing.type === 'rect' && drawing.points.length >= 2) {
        const p1 = projectPoint(drawing.points[0]);
        const p2 = projectPoint(drawing.points[1]);

        if (p1 && p2) {
          const left = Math.min(p1.x, p2.x);
          const top = Math.min(p1.y, p2.y);
          const rectWidth = Math.abs(p2.x - p1.x);
          const rectHeight = Math.abs(p2.y - p1.y);

          ctx.fillStyle = hexToRgba(color, drawing.fillOpacity ?? 0.12);
          ctx.fillRect(left, top, rectWidth, rectHeight);
          ctx.strokeRect(left, top, rectWidth, rectHeight);
        }
      } else if (drawing.type === 'fib' && drawing.points.length >= 2) {
        const fibReverse = (drawing as any).fibReverse ?? false;
        const fromPoint = fibReverse ? drawing.points[1] : drawing.points[0];
        const toPoint = fibReverse ? drawing.points[0] : drawing.points[1];
        const p1 = projectPoint(fromPoint);
        const p2 = projectPoint(toPoint);

        if (p1 && p2) {
          const levels = getVisibleFibLevels(drawing);
          const diff = p2.y - p1.y;
          const priceDiff = toPoint.price - fromPoint.price;
          const minX = Math.min(p1.x, p2.x);
          const maxAnchorX = Math.max(p1.x, p2.x);
          const lineStartX = (drawing as any).fibExtendLeft ? 0 : minX;
          const lineEndX = (drawing as any).fibExtendRight === false ? maxAnchorX : maxX;
          const showFibLabels = (drawing as any).fibShowLabels !== false;

          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.setLineDash([]);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          levels.forEach((level: { value: number; label?: string; color?: string; lineStyle?: DrawingLineStyle }) => {
            const y = p1.y + diff * level.value;
            const priceAtLevel = fromPoint.price + priceDiff * level.value;
            const labelText =
              fibLabelMode === 'price'
                ? priceAtLevel.toFixed(4)
                : level.label || `${(level.value * 100).toFixed(1)}%`;

            ctx.beginPath();
            ctx.strokeStyle = level.color || color;
            ctx.lineWidth = baseLineWidth;
            applyLineStyle(ctx, level.lineStyle || drawing.lineStyle || 'solid');
            ctx.moveTo(lineStartX, y);
            ctx.lineTo(lineEndX, y);
            ctx.stroke();

            if (showFibLabels) {
              drawTextLabel(
                ctx,
                labelText,
                lineStartX,
                lineEndX,
                y,
                level.color || color,
                labelHorizontalAlign,
                labelVerticalAlign,
              );
            }
          });
        }
      } else if (drawing.type === 'rr' && drawing.points.length >= 2) {
        // Risk:Reward rendering — entry, stop, target (3 points total)
        const entryPoint = drawing.points[0];
        const stopPoint = drawing.points[1];
        const targetPoint = drawing.points[2];

        const pEntry = projectPoint(entryPoint);
        const pStop = projectPoint(stopPoint);
        const pTarget = targetPoint ? projectPoint(targetPoint) : null;

        if (pEntry && pStop) {
          const entryPrice = entryPoint.price;
          const stopPrice = stopPoint.price;
          const risk = Math.abs(entryPrice - stopPrice);
          
          // Use explicit target or calculate from multiplier
          let targetPrice = entryPrice;
          if (pTarget && targetPoint) {
            targetPrice = targetPoint.price;
          } else {
            const rrMultiplier = drawing.rrMultiplier ?? 1;
            targetPrice = entryPrice + (entryPrice - stopPrice) * rrMultiplier;
          }

          const yEntry = pEntry.y;
          const yStop = pStop.y;
          const targetY = series.priceToCoordinate(targetPrice);

          // Get left and right X coordinates from points (bounded, not full width)
          const xLeft = Math.min(pEntry.x, pStop.x, pTarget?.x ?? pEntry.x);
          const xRight = Math.max(pEntry.x, pStop.x, pTarget?.x ?? pEntry.x);

          // Determine red/green areas
          const redTop = Math.min(yEntry, yStop);
          const redBottom = Math.max(yEntry, yStop);

          if (targetY != null) {
            const greenTop = Math.min(yEntry, targetY);
            const greenBottom = Math.max(yEntry, targetY);

            // Draw green fill
            ctx.save();
            ctx.fillStyle = hexToRgba('#34D399', 0.12);
            ctx.fillRect(xLeft, greenTop, Math.max(1, xRight - xLeft), Math.max(1, greenBottom - greenTop));
            ctx.restore();
          }

          // Draw red fill
          ctx.save();
          ctx.fillStyle = hexToRgba('#EF5350', 0.12);
          ctx.fillRect(xLeft, redTop, Math.max(1, xRight - xLeft), Math.max(1, redBottom - redTop));
          ctx.restore();

          // Draw lines
          ctx.save();
          ctx.lineWidth = baseLineWidth;

          // Entry line (bounded)
          ctx.strokeStyle = drawing.color ?? '#ffffff';
          ctx.beginPath();
          ctx.moveTo(xLeft, yEntry);
          ctx.lineTo(xRight, yEntry);
          ctx.stroke();

          // Stop line (bounded)
          ctx.strokeStyle = '#ef5350';
          ctx.beginPath();
          ctx.moveTo(xLeft, yStop);
          ctx.lineTo(xRight, yStop);
          ctx.stroke();

          // Target line (bounded)
          if (targetY != null) {
            ctx.strokeStyle = '#26a69a';
            ctx.beginPath();
            ctx.moveTo(xLeft, targetY);
            ctx.lineTo(xRight, targetY);
            ctx.stroke();
          }

          // Labels
          const rewardAbs = Math.abs(targetPrice - entryPrice);
          const rrVal = risk > 0 ? rewardAbs / risk : NaN;
          const rrLabel = isFinite(rrVal) ? `RR ${rrVal.toFixed(2)}` : 'RR —';

          drawTextLabel(
            ctx,
            `${entryPrice.toFixed(4)} ${rrLabel}`,
            xLeft,
            xRight,
            yEntry,
            drawing.color ?? '#ffffff',
            labelHorizontalAlign,
            labelVerticalAlign,
          );

          drawTextLabel(
            ctx,
            `Stop ${stopPrice.toFixed(4)}`,
            xLeft,
            xRight,
            yStop,
            '#ef5350',
            'right',
            'top',
          );

          if (targetY != null) {
            drawTextLabel(
              ctx,
              `Target ${targetPrice.toFixed(4)}`,
              xLeft,
              xRight,
              targetY,
              '#26a69a',
              'right',
              'bottom',
            );
          }

          ctx.restore();
        }
      }

      if (showPriceLabels && drawing.type !== 'hline') {
        drawing.points.forEach((point) => {
          const coords = projectPoint(point);
          if (!coords) return;

          drawTextLabel(
            ctx,
            point.price.toFixed(4),
            coords.x - 36,
            coords.x + 36,
            coords.y,
            color,
            labelHorizontalAlign,
            labelVerticalAlign,
          );
        });
      }

      if (isHovered && !isSelected && !drawing.locked) {
        ctx.setLineDash([]);
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

      if (isSelected && !drawing.locked) {
        ctx.setLineDash([]);
        drawing.points.forEach((point) => {
          const coords = projectPoint(point);
          if (!coords) return;

          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.arc(coords.x, coords.y, HANDLE_RADIUS + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }

      ctx.restore();
    });
  }, [drawWidth, isDrawingVisibleOnTimeframe, projectPoint, series]);

  const selectedHandles = useMemo(() => {
    if (activeTool !== 'cursor' || currentDrawIdRef.current) return [];
    if (!selectedDrawingId) return [];

    const drawing = drawings.find((item) => item.id === selectedDrawingId);
    if (!drawing || drawing.locked || !isDrawingVisibleOnTimeframe(drawing)) return [];

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
  }, [
    activeTool,
    drawings,
    isDrawingVisibleOnTimeframe,
    overlayTick,
    projectPoint,
    selectedDrawingId,
  ]);

  useEffect(() => {
    renderDrawings();
    bumpOverlay();
  }, [drawings, selectedDrawingId, timeframe, renderDrawings, bumpOverlay]);

  useEffect(() => {
    let frame1 = 0;
    let frame2 = 0;

    frame1 = window.requestAnimationFrame(() => {
      renderDrawings();
      bumpOverlay();

      frame2 = window.requestAnimationFrame(() => {
        renderDrawings();
        bumpOverlay();
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [redrawKey, renderDrawings, bumpOverlay]);

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
    const host = containerRef.current?.parentElement;
    if (!host) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (activeToolRef.current !== 'cursor') return;
      if (draggingHandle || draggingDrawing) return;

      const canvasPoint = getCanvasPointFromClient(event.clientX, event.clientY);
      if (!canvasPoint) return;

      const handleHit = findHandleAt(canvasPoint.x, canvasPoint.y);
      if (handleHit) return;

      const drawingId = findDrawingAt(canvasPoint.x, canvasPoint.y);
      if (!drawingId) return;

      const drawing = drawingsRef.current.find((item) => item.id === drawingId);
      if (!drawing || drawing.locked || !isDrawingVisibleOnTimeframe(drawing)) return;

      const anchor = toLogicalPricePoint(canvasPoint.x, canvasPoint.y);
      if (!anchor) return;

      syncSelection(drawingId);
      suppressNextClickRef.current = false;
      setDraggingDrawing({
        drawingId,
        startLogical: anchor.logical,
        startPrice: anchor.price,
        originalPoints: drawing.points.map((point) => ({
          ...point,
          logical: getPointLogical(point) ?? point.logical,
        })),
      });

      event.preventDefault();
      event.stopPropagation();
    };

    host.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      host.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [
    draggingDrawing,
    draggingHandle,
    findDrawingAt,
    findHandleAt,
    getCanvasPointFromClient,
    getPointLogical,
    isDrawingVisibleOnTimeframe,
    syncSelection,
    toLogicalPricePoint,
  ]);

  useEffect(() => {
    const handleScaleChange = () => {
      renderDrawings();
      bumpOverlay();
    };

    const handleChartClick = (param: MouseEventParams) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

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

      // Drawing creation
      if (!currentDrawIdRef.current) {
        const firstPoint = toChartPoint(param.point.x, param.point.y);
        if (!firstPoint) return;

        const id = uuidv4();
        currentDrawIdRef.current = id;

        useChartStore.getState().addDrawing({
          id,
          type: tool === 'rrLong' || tool === 'rrShort' ? 'rr' : tool,
          points: [firstPoint],
          baseTimeframe: timeframe,
        });

        syncSelection(null);
        renderDrawings();
        bumpOverlay();

        if (tool === 'hline') {
          currentDrawIdRef.current = null;
          useChartStore.getState().setActiveTool('cursor');
        }

        return;
      }

      const id = currentDrawIdRef.current;
      const existing = drawingsRef.current.find((drawing) => drawing.id === id);
      if (!existing || existing.points.length === 0) return;

      const nextPoint = toChartPoint(param.point.x, param.point.y, existing.points[0]);
      if (!nextPoint) return;

      // For RR tool, add a third point (target) and keep waiting
      if (tool === 'rrLong' || tool === 'rrShort') {
        if (existing.points.length === 1) {
          // Second click: set stop level
          useChartStore.getState().updateDrawing(id, {
            points: [...existing.points, nextPoint],
          });
          return;
        } else if (existing.points.length === 2) {
          // Third click: set target level
          useChartStore.getState().updateDrawing(id, {
            points: [...existing.points, nextPoint],
          });
          currentDrawIdRef.current = null;
          useChartStore.getState().setActiveTool('cursor');
          syncSelection(null);
          renderDrawings();
          bumpOverlay();
          return;
        }
      }

      // For other tools (trendline, rect, fib, ray)
      useChartStore.getState().updateDrawing(id, {
        points: [...existing.points.slice(0, 1), nextPoint],
      });

      currentDrawIdRef.current = null;
      useChartStore.getState().setActiveTool('cursor');
      syncSelection(null);
      renderDrawings();
      bumpOverlay();
    };

    const handleCrosshairMove = (param: MouseEventParams) => {
      const tool = activeToolRef.current;

      if (tool !== 'cursor') {
        const id = currentDrawIdRef.current;
        if (!id || !param.point) return;

        const existing = drawingsRef.current.find((drawing) => drawing.id === id);
        if (!existing || existing.points.length === 0) return;

        let previewPoint = toChartPoint(param.point.x, param.point.y, existing.points[0]);
        if (!previewPoint) return;

        // Apply directional constraints during preview for RR tool
        if ((tool === 'rrLong' || tool === 'rrShort') && existing.points.length >= 1) {
          const entryPrice = existing.points[0].price;
          const rrType = tool === 'rrLong' ? 'long' : 'short';

          if (existing.points.length === 1) {
            // Drawing stop point
            if (rrType === 'long') {
              // Stop must be below entry - only allow prices below entry
              if (previewPoint.price >= entryPrice) {
                previewPoint = {
                  ...previewPoint,
                  price: entryPrice - 0.0001,
                };
              }
            } else {
              // Stop must be above entry
              if (previewPoint.price <= entryPrice) {
                previewPoint = {
                  ...previewPoint,
                  price: entryPrice + 0.0001,
                };
              }
            }
          } else if (existing.points.length === 2) {
            // Drawing target point
            if (rrType === 'long') {
              // Target must be above entry
              if (previewPoint.price <= entryPrice) {
                previewPoint = {
                  ...previewPoint,
                  price: entryPrice + 0.0001,
                };
              }
            } else {
              // Target must be below entry
              if (previewPoint.price >= entryPrice) {
                previewPoint = {
                  ...previewPoint,
                  price: entryPrice - 0.0001,
                };
              }
            }
          }
        }

        useChartStore.getState().updateDrawing(id, {
          points: [existing.points[0], previewPoint],
        });

        return;
      }

      if (draggingHandle || draggingDrawing) return;
      if (!param.point) return;

      const drawingHit =
        findHandleAt(param.point.x, param.point.y)?.drawingId ??
        findDrawingAt(param.point.x, param.point.y);

      if (hoveredDrawingIdRef.current !== drawingHit) {
        hoveredDrawingIdRef.current = drawingHit;
        renderDrawings();
        bumpOverlay();
      }
    };

    chart.subscribeClick(handleChartClick);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleScaleChange);

    renderDrawings();
    bumpOverlay();

    return () => {
      chart.unsubscribeClick(handleChartClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleScaleChange);
    };
  }, [
    bumpOverlay,
    chart,
    draggingDrawing,
    draggingHandle,
    findDrawingAt,
    findHandleAt,
    renderDrawings,
    syncSelection,
    toChartPoint,
  ]);

  useEffect(() => {
    if (!draggingHandle && !draggingDrawing) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      
      const canvasPoint = getCanvasPointFromClient(event.clientX, event.clientY);
      if (!canvasPoint) return;

      if (draggingHandle) {
        const drawing = drawingsRef.current.find((item) => item.id === draggingHandle.drawingId);
        if (!drawing || drawing.locked) return;

        let nextPoint = toChartPoint(
          canvasPoint.x,
          canvasPoint.y,
          drawing.points[draggingHandle.pointIndex],
        );

        if (!nextPoint) return;

        // Apply directional constraints for RR drawings
        if (drawing.type === 'rr' && drawing.points.length >= 2) {
          const rrType = (drawing as any).rrType ?? 'long';
          const entryPrice = drawing.points[0].price;
          const pointIndex = draggingHandle.pointIndex;

          if (rrType === 'long') {
            // For long: stop (point 1) must be BELOW entry, target (point 2) must be ABOVE entry
            if (pointIndex === 1) {
              // Stop point - constrain to below entry
              if (nextPoint.price >= entryPrice) {
                nextPoint = {
                  ...nextPoint,
                  price: entryPrice - 0.0001,
                };
              }
            } else if (pointIndex === 2) {
              // Target point - constrain to above entry
              if (nextPoint.price <= entryPrice) {
                nextPoint = {
                  ...nextPoint,
                  price: entryPrice + 0.0001,
                };
              }
            }
          } else if (rrType === 'short') {
            // For short: stop (point 1) must be ABOVE entry, target (point 2) must be BELOW entry
            if (pointIndex === 1) {
              // Stop point - constrain to above entry
              if (nextPoint.price <= entryPrice) {
                nextPoint = {
                  ...nextPoint,
                  price: entryPrice + 0.0001,
                };
              }
            } else if (pointIndex === 2) {
              // Target point - constrain to below entry
              if (nextPoint.price >= entryPrice) {
                nextPoint = {
                  ...nextPoint,
                  price: entryPrice - 0.0001,
                };
              }
            }
          }
        }

        // Preserve logical coordinate
        const logical = chart.timeScale().coordinateToLogical(canvasPoint.x);
        const nextPointWithLogical = {
          ...nextPoint,
          logical: logical != null ? Number(logical) : nextPoint.logical,
        };

        const nextPoints = drawing.points.map((point, index) =>
          index === draggingHandle.pointIndex ? nextPointWithLogical : point,
        );

        suppressNextClickRef.current = true;
        useChartStore.getState().updateDrawing(draggingHandle.drawingId, {
          points: nextPoints,
        });

        return;
      }

      if (draggingDrawing) {
        const drawing = drawingsRef.current.find((item) => item.id === draggingDrawing.drawingId);
        const anchor = toLogicalPricePoint(canvasPoint.x, canvasPoint.y);
        if (!anchor || !drawing) return;

        const logicalDelta = anchor.logical - draggingDrawing.startLogical;
        const priceDelta = anchor.price - draggingDrawing.startPrice;

        suppressNextClickRef.current = true;
        useChartStore.getState().updateDrawing(draggingDrawing.drawingId, {
          points: draggingDrawing.originalPoints.map((point) => ({
            time: point.time + Math.round(logicalDelta * (drawing.baseTimeframe ?? timeframe)),
            price: point.price + priceDelta,
            logical:
              typeof point.logical === 'number'
                ? point.logical + logicalDelta
                : logicalDelta,
          })),
        });
      }
    };

    const stopDragging = () => {
      setDraggingHandle(null);
      setDraggingDrawing(null);
    };

    window.addEventListener('pointermove', handlePointerMove, { capture: true });
    window.addEventListener('pointerup', stopDragging, { capture: true });
    window.addEventListener('pointercancel', stopDragging, { capture: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      window.removeEventListener('pointerup', stopDragging, { capture: true });
      window.removeEventListener('pointercancel', stopDragging, { capture: true });
    };
  }, [
    draggingDrawing,
    draggingHandle,
    getCanvasPointFromClient,
    timeframe,
    toChartPoint,
    toLogicalPricePoint,
    chart,
  ]);

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
        const selected = drawingsRef.current.find(
          (drawing) => drawing.id === selectedDrawingIdRef.current,
        );

        if (selected?.locked) return;

        useChartStore.getState().removeDrawing(selectedDrawingIdRef.current);
        syncSelection(null);
        renderDrawings();
        bumpOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bumpOverlay, renderDrawings, syncSelection]);

  const startHandleDrag =
    (drawingId: string, pointIndex: number) => (event: React.PointerEvent) => {
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
              touchAction: 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}