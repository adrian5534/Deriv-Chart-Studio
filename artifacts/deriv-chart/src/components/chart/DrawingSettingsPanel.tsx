import React from 'react';
import {
  DrawingLineStyle,
  FibLabelMode,
  DrawingLabelHorizontalAlign,
  DrawingLabelVerticalAlign,
  useChartStore,
} from '../../store/use-chart-store';
import { TIMEFRAMES } from '../../lib/deriv-constants';

const LINE_STYLES: DrawingLineStyle[] = ['solid', 'dashed', 'dotted'];
const LABEL_HORIZONTAL_OPTIONS: DrawingLabelHorizontalAlign[] = ['left', 'center', 'right'];
const LABEL_VERTICAL_OPTIONS: DrawingLabelVerticalAlign[] = ['top', 'middle', 'bottom'];
const FIB_LABEL_MODES: FibLabelMode[] = ['percent', 'price'];

const TIMEFRAME_OPTIONS = TIMEFRAMES.map((timeframe) => ({
  value: timeframe.value,
  label: timeframe.label,
}));

const DEFAULT_FIB_LEVELS = [
  { value: 0, label: '0.0%', color: '#ef5350', visible: true, lineStyle: 'solid' as DrawingLineStyle },
  { value: 0.236, label: '23.6%', color: '#ff9800', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.382, label: '38.2%', color: '#fdd835', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.5, label: '50.0%', color: '#26a69a', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.618, label: '61.8%', color: '#26a69a', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 0.786, label: '78.6%', color: '#42a5f5', visible: true, lineStyle: 'dashed' as DrawingLineStyle },
  { value: 1, label: '100.0%', color: '#ef5350', visible: true, lineStyle: 'solid' as DrawingLineStyle },
];

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
  const supportsFib = drawing.type === 'fib';
  const visibleTimeframes = drawing.visibleTimeframes ?? [];
  const showOnAllTimeframes = drawing.visibleTimeframes == null;
  const fibLevels =
    drawing.fibLevels && drawing.fibLevels.length > 0
      ? drawing.fibLevels
      : DEFAULT_FIB_LEVELS;

  const toggleTimeframe = (timeframe: number) => {
    const base = drawing.visibleTimeframes ?? [];
    const next = base.includes(timeframe)
      ? base.filter((item) => item !== timeframe)
      : [...base, timeframe].sort((a, b) => a - b);

    updateSelectedDrawing({
      visibleTimeframes: next,
    });
  };

  const updateFibLevel = (
    index: number,
    patch: Partial<(typeof fibLevels)[number]>,
  ) => {
    const nextLevels = fibLevels
      .map((level, levelIndex) => (levelIndex === index ? { ...level, ...patch } : level))
      .sort((a, b) => a.value - b.value);

    updateSelectedDrawing({ fibLevels: nextLevels });
  };

  const removeFibLevel = (index: number) => {
    const nextLevels = fibLevels.filter((_, levelIndex) => levelIndex !== index);
    updateSelectedDrawing({
      fibLevels: nextLevels.length ? nextLevels : DEFAULT_FIB_LEVELS.map((level) => ({ ...level })),
    });
  };

  return (
    <div className="absolute right-3 top-3 bottom-3 z-20 w-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs text-white shadow-xl backdrop-blur">
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

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-slate-300">Color</span>
          <input
            type="color"
            value={drawing.color ?? '#2962FF'}
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
            value={drawing.lineWidth ?? 2}
            onChange={(event) =>
              updateSelectedDrawing({ lineWidth: Number(event.target.value) })
            }
            className="w-full"
          />
          <div className="mt-1 text-slate-400">{drawing.lineWidth ?? 2}px</div>
        </label>

        <label className="block">
          <span className="mb-1 block text-slate-300">Line style</span>
          <select
            value={drawing.lineStyle ?? 'solid'}
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
              value={drawing.fillOpacity ?? 0.12}
              onChange={(event) =>
                updateSelectedDrawing({ fillOpacity: Number(event.target.value) })
              }
              className="w-full"
            />
            <div className="mt-1 text-slate-400">
              {Math.round((drawing.fillOpacity ?? 0.12) * 100)}%
            </div>
          </label>
        )}

        <div className="rounded border border-slate-700 p-3">
          <div className="mb-2 text-slate-300">Labels</div>

          <label className="mb-2 flex items-center justify-between rounded border border-slate-700 px-3 py-2">
            <span className="text-slate-300">Show price labels</span>
            <input
              type="checkbox"
              checked={drawing.showPriceLabels ?? (drawing.type === 'hline')}
              onChange={(event) =>
                updateSelectedDrawing({ showPriceLabels: event.target.checked })
              }
            />
          </label>

          {supportsFib && (
            <label className="mb-2 block">
              <span className="mb-1 block text-slate-300">Fib label content</span>
              <select
                value={drawing.fibLabelMode ?? 'percent'}
                onChange={(event) =>
                  updateSelectedDrawing({
                    fibLabelMode: event.target.value as FibLabelMode,
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              >
                {FIB_LABEL_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-slate-300">Horizontal</span>
              <select
                value={drawing.labelHorizontalAlign ?? 'right'}
                onChange={(event) =>
                  updateSelectedDrawing({
                    labelHorizontalAlign: event.target.value as DrawingLabelHorizontalAlign,
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              >
                {LABEL_HORIZONTAL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-300">Vertical</span>
              <select
                value={drawing.labelVerticalAlign ?? 'top'}
                onChange={(event) =>
                  updateSelectedDrawing({
                    labelVerticalAlign: event.target.value as DrawingLabelVerticalAlign,
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              >
                {LABEL_VERTICAL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rounded border border-slate-700 p-3">
          <div className="mb-2 text-slate-300">Visible on timeframes</div>

          <label className="mb-3 flex items-center justify-between rounded border border-slate-700 px-3 py-2">
            <span className="text-slate-300">Show on all</span>
            <input
              type="checkbox"
              checked={showOnAllTimeframes}
              onChange={(event) =>
                updateSelectedDrawing({
                  visibleTimeframes: event.target.checked ? undefined : [],
                })
              }
            />
          </label>

          <div className="grid grid-cols-4 gap-2">
            {TIMEFRAME_OPTIONS.map((option) => {
              const active = visibleTimeframes.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={showOnAllTimeframes}
                  onClick={() => toggleTimeframe(option.value)}
                  className={`rounded border px-2 py-2 text-center ${
                    active
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-300'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {!showOnAllTimeframes && visibleTimeframes.length === 0 && (
            <div className="mt-2 text-[11px] text-amber-400">
              No timeframe selected.
            </div>
          )}
        </div>

        {supportsFib && (
          <>
            <div className="rounded border border-slate-700 p-3">
              <div className="mb-2 text-slate-300">Fibonacci settings</div>

              <div className="space-y-2">
                <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
                  <span className="text-slate-300">Reverse levels</span>
                  <input
                    type="checkbox"
                    checked={drawing.fibReverse ?? false}
                    onChange={(event) =>
                      updateSelectedDrawing({ fibReverse: event.target.checked })
                    }
                  />
                </label>

                <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
                  <span className="text-slate-300">Extend left</span>
                  <input
                    type="checkbox"
                    checked={drawing.fibExtendLeft ?? false}
                    onChange={(event) =>
                      updateSelectedDrawing({ fibExtendLeft: event.target.checked })
                    }
                  />
                </label>

                <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
                  <span className="text-slate-300">Extend right</span>
                  <input
                    type="checkbox"
                    checked={drawing.fibExtendRight ?? true}
                    onChange={(event) =>
                      updateSelectedDrawing({ fibExtendRight: event.target.checked })
                    }
                  />
                </label>

                <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
                  <span className="text-slate-300">Show fib labels</span>
                  <input
                    type="checkbox"
                    checked={drawing.fibShowLabels ?? true}
                    onChange={(event) =>
                      updateSelectedDrawing({ fibShowLabels: event.target.checked })
                    }
                  />
                </label>
              </div>
            </div>

            <div className="rounded border border-slate-700 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-slate-300">Fib levels</div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedDrawing({
                        fibLevels: [
                          ...fibLevels,
                          {
                            value: 1.272,
                            label: '127.2%',
                            color: drawing.color ?? '#2962FF',
                            visible: true,
                            lineStyle: 'dashed' as DrawingLineStyle,
                          },
                        ].sort((a, b) => a.value - b.value),
                      })
                    }
                    className="rounded bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                  >
                    Add
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedDrawing({
                        fibLevels: DEFAULT_FIB_LEVELS.map((level) => ({ ...level })),
                      })
                    }
                    className="rounded bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {fibLevels.map((level, index) => (
                  <div
                    key={`${index}-${level.value}`}
                    className="rounded border border-slate-700 p-2"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-slate-300">Level {index + 1}</div>
                      <button
                        type="button"
                        onClick={() => removeFibLevel(index)}
                        className="rounded px-2 py-1 text-red-300 hover:bg-slate-800 hover:text-red-200"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-slate-400">Ratio</span>
                        <input
                          type="number"
                          step="0.001"
                          value={level.value}
                          onChange={(event) =>
                            updateFibLevel(index, {
                              value: Number(event.target.value),
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-slate-400">Label</span>
                        <input
                          type="text"
                          value={level.label ?? ''}
                          onChange={(event) =>
                            updateFibLevel(index, {
                              label: event.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-slate-400">Color</span>
                        <input
                          type="color"
                          value={level.color ?? drawing.color ?? '#2962FF'}
                          onChange={(event) =>
                            updateFibLevel(index, {
                              color: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded border border-slate-700 bg-slate-950"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-slate-400">Style</span>
                        <select
                          value={level.lineStyle ?? 'solid'}
                          onChange={(event) =>
                            updateFibLevel(index, {
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
                    </div>

                    <label className="mt-2 flex items-center justify-between rounded border border-slate-700 px-3 py-2">
                      <span className="text-slate-300">Visible</span>
                      <input
                        type="checkbox"
                        checked={level.visible !== false}
                        onChange={(event) =>
                          updateFibLevel(index, {
                            visible: event.target.checked,
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
          <span className="text-slate-300">Lock drawing</span>
          <input
            type="checkbox"
            checked={drawing.locked ?? false}
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