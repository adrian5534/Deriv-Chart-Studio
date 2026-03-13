import React from 'react';
import { DrawingLineStyle, useChartStore } from '../../store/use-chart-store';

const LINE_STYLES: DrawingLineStyle[] = ['solid', 'dashed', 'dotted'];

function formatDrawingType(type: string) {
  switch (type) {
    case 'hline':
      return 'Horizontal Line';
    case 'trendline':
      return 'Trend Line';
    case 'fib':
      return 'Fibonacci';
    case 'rect':
      return 'Rectangle';
    case 'ray':
      return 'Ray';
    default:
      return type;
  }
}

export default function DrawingSettingsPanel() {
  const selectedDrawingId = useChartStore((state) => state.selectedDrawingId);
  const drawing = useChartStore((state) =>
    state.drawings.find((item) => item.id === state.selectedDrawingId) ?? null,
  );
  const updateSelectedDrawing = useChartStore((state) => state.updateSelectedDrawing);
  const removeDrawing = useChartStore((state) => state.removeDrawing);
  const setSelectedDrawingId = useChartStore((state) => state.setSelectedDrawingId);

  if (!selectedDrawingId || !drawing) {
    return null;
  }

  const supportsFill = drawing.type === 'rect';

  return (
    <div className="absolute right-3 top-3 z-20 w-64 rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs text-white shadow-xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{formatDrawingType(drawing.type)}</div>
          <div className="text-slate-400">Selected drawing</div>
        </div>

        <button
          type="button"
          onClick={() => setSelectedDrawingId(null)}
          className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-slate-300">Color</span>
          <input
            type="color"
            value={drawing.color}
            onChange={(event) => updateSelectedDrawing({ color: event.target.value })}
            className="h-10 w-full cursor-pointer rounded border border-slate-700 bg-slate-950"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-slate-300">Line width</span>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={drawing.lineWidth}
            onChange={(event) =>
              updateSelectedDrawing({ lineWidth: Number(event.target.value) })
            }
            className="w-full"
          />
          <div className="mt-1 text-slate-400">{drawing.lineWidth}px</div>
        </label>

        <label className="block">
          <span className="mb-1 block text-slate-300">Line style</span>
          <select
            value={drawing.lineStyle}
            onChange={(event) =>
              updateSelectedDrawing({
                lineStyle: event.target.value as DrawingLineStyle,
              })
            }
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
          >
            {LINE_STYLES.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </label>

        {supportsFill && (
          <label className="block">
            <span className="mb-1 block text-slate-300">Fill opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={drawing.fillOpacity}
              onChange={(event) =>
                updateSelectedDrawing({ fillOpacity: Number(event.target.value) })
              }
              className="w-full"
            />
            <div className="mt-1 text-slate-400">
              {Math.round(drawing.fillOpacity * 100)}%
            </div>
          </label>
        )}

        <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
          <span className="text-slate-300">Lock drawing</span>
          <input
            type="checkbox"
            checked={drawing.locked}
            onChange={(event) => updateSelectedDrawing({ locked: event.target.checked })}
          />
        </label>

        <button
          type="button"
          onClick={() => {
            removeDrawing(selectedDrawingId);
            setSelectedDrawingId(null);
          }}
          className="w-full rounded bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-500"
        >
          Delete drawing
        </button>
      </div>
    </div>
  );
}