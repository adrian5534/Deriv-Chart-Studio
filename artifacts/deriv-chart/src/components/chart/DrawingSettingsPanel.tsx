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

const TIMEFRAME_OPTIONS = TIMEFRAMES.map((tf) => ({ value: tf.value, label: tf.label }));

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
    case 'hline': return 'Horizontal Line';
    case 'trendline': return 'Trend Line';
    case 'fib': return 'Fibonacci';
    case 'rect': return 'Rectangle';
    case 'ray': return 'Ray';
    case 'rr': return 'Risk:Reward';
    default: return type;
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

  if (!selectedDrawingId || !drawing) return null;

  const supportsFill = drawing.type === 'rect';
  const supportsFib = drawing.type === 'fib';
  const supportsRR = drawing.type === 'rr';
  const visibleTimeframes = drawing.visibleTimeframes ?? [];
  const showOnAllTimeframes = drawing.visibleTimeframes == null;

  type FibLevel = (typeof DEFAULT_FIB_LEVELS)[number];
  const fibLevels: FibLevel[] =
    Array.isArray((drawing as any).fibLevels) && (drawing as any).fibLevels.length > 0
      ? ((drawing as any).fibLevels as FibLevel[])
      : DEFAULT_FIB_LEVELS;

  const toggleTimeframe = (tf: number) => {
    const base = drawing.visibleTimeframes ?? [];
    const next = base.includes(tf)
      ? base.filter((item) => item !== tf)
      : [...base, tf].sort((a, b) => a - b);
    updateSelectedDrawing({ visibleTimeframes: next });
  };

  const updateFibLevel = (index: number, patch: Partial<FibLevel>) => {
    const nextLevels = fibLevels
      .map((level, i) => (i === index ? { ...level, ...patch } : level))
      .sort((a, b) => a.value - b.value);
    updateSelectedDrawing({ fibLevels: nextLevels } as any);
  };

  const removeFibLevel = (index: number) => {
    const nextLevels = fibLevels.filter((_, i) => i !== index);
    updateSelectedDrawing({ fibLevels: nextLevels.length ? nextLevels : DEFAULT_FIB_LEVELS.map((l) => ({ ...l })) } as any);
  };

  return (
    <div className="absolute right-3 top-3 bottom-3 z-20 w-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs text-white shadow-xl backdrop-blur" style={{ resize: 'both' }}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{formatDrawingType(drawing.type)}</div>
          <div className="text-slate-400">Selected drawing</div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => { removeDrawing(drawing.id); setSelectedDrawingId(null); }}
            className="rounded px-2 py-1 text-red-400 hover:bg-slate-800 hover:text-red-300"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedDrawingId(null)}
            className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-slate-300">Color</span>
          <input
            type="color"
            value={drawing.color ?? '#2962FF'}
            onChange={(e) => updateSelectedDrawing({ color: e.target.value })}
            className="h-10 w-full cursor-pointer rounded border border-slate-700 bg-slate-950"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-slate-300">Line width</span>
          <input
            type="range" min={1} max={8} step={1}
            value={drawing.lineWidth ?? 2}
            onChange={(e) => updateSelectedDrawing({ lineWidth: Number(e.target.value) })}
            className="w-full"
          />
          <div className="mt-1 text-slate-400">{drawing.lineWidth ?? 2}px</div>
        </label>

        <label className="block">
          <span className="mb-1 block text-slate-300">Line style</span>
          <select
            value={drawing.lineStyle ?? 'solid'}
            onChange={(e) => updateSelectedDrawing({ lineStyle: e.target.value as DrawingLineStyle })}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
          >
            {LINE_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
          </select>
        </label>

        {supportsFill && (
          <label className="block">
            <span className="mb-1 block text-slate-300">Fill opacity</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={drawing.fillOpacity ?? 0.12}
              onChange={(e) => updateSelectedDrawing({ fillOpacity: Number(e.target.value) })}
              className="w-full"
            />
            <div className="mt-1 text-slate-400">{Math.round((drawing.fillOpacity ?? 0.12) * 100)}%</div>
          </label>
        )}

        <div className="rounded border border-slate-700 p-3">
          <div className="mb-2 text-slate-300">Labels</div>
          <label className="mb-2 flex items-center justify-between rounded border border-slate-700 px-3 py-2">
            <span className="text-slate-300">Show price labels</span>
            <input
              type="checkbox"
              checked={drawing.showPriceLabels ?? (drawing.type === 'hline')}
              onChange={(e) => updateSelectedDrawing({ showPriceLabels: e.target.checked })}
            />
          </label>

          {supportsFib && (
            <label className="mb-2 block">
              <span className="mb-1 block text-slate-300">Fib label content</span>
              <select
                value={(drawing as any).fibLabelMode ?? 'percent'}
                onChange={(e) => updateSelectedDrawing({ fibLabelMode: e.target.value as FibLabelMode } as any)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              >
                {FIB_LABEL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-slate-300">Horizontal</span>
              <select
                value={drawing.labelHorizontalAlign ?? 'right'}
                onChange={(e) => updateSelectedDrawing({ labelHorizontalAlign: e.target.value as DrawingLabelHorizontalAlign })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              >
                {LABEL_HORIZONTAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-300">Vertical</span>
              <select
                value={drawing.labelVerticalAlign ?? 'top'}
                onChange={(e) => updateSelectedDrawing({ labelVerticalAlign: e.target.value as DrawingLabelVerticalAlign })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              >
                {LABEL_VERTICAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
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
              onChange={(e) => updateSelectedDrawing({ visibleTimeframes: e.target.checked ? undefined : [] })}
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
                  className={`rounded border px-2 py-2 text-center ${active ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-950 text-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {!showOnAllTimeframes && visibleTimeframes.length === 0 && (
            <div className="mt-2 text-[11px] text-amber-400">No timeframe selected.</div>
          )}
        </div>

        {supportsFib && (
          <>
            <div className="rounded border border-slate-700 p-3">
              <div className="mb-2 text-slate-300">Fibonacci settings</div>
              <div className="space-y-2">
                {[
                  { key: 'fibReverse', label: 'Reverse levels' },
                  { key: 'fibExtendLeft', label: 'Extend left' },
                  { key: 'fibExtendRight', label: 'Extend right', defaultVal: true },
                  { key: 'fibShowLabels', label: 'Show fib labels', defaultVal: true },
                ].map(({ key, label, defaultVal }) => (
                  <label key={key} className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
                    <span className="text-slate-300">{label}</span>
                    <input
                      type="checkbox"
                      checked={(drawing as any)[key] ?? (defaultVal ?? false)}
                      onChange={(e) => updateSelectedDrawing({ [key]: e.target.checked } as any)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded border border-slate-700 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-slate-300">Fib levels</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateSelectedDrawing({ fibLevels: [...fibLevels, { value: 1.272, label: '127.2%', color: drawing.color ?? '#2962FF', visible: true, lineStyle: 'dashed' as DrawingLineStyle }].sort((a, b) => a.value - b.value) } as any)}
                    className="rounded bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectedDrawing({ fibLevels: DEFAULT_FIB_LEVELS.map((l) => ({ ...l })) } as any)}
                    className="rounded bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {fibLevels.map((level, index) => (
                  <div key={`${index}-${level.value}`} className="rounded border border-slate-700 p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-slate-300">Level {index + 1}</div>
                      <button type="button" onClick={() => removeFibLevel(index)} className="rounded px-2 py-1 text-red-300 hover:bg-slate-800 hover:text-red-200">Remove</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-slate-400">Ratio</span>
                        <input type="number" step="0.001" value={level.value} onChange={(e) => updateFibLevel(index, { value: Number(e.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-slate-400">Label</span>
                        <input type="text" value={level.label ?? ''} onChange={(e) => updateFibLevel(index, { label: e.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-slate-400">Color</span>
                        <input type="color" value={level.color ?? drawing.color ?? '#2962FF'} onChange={(e) => updateFibLevel(index, { color: e.target.value })} className="h-10 w-full rounded border border-slate-700 bg-slate-950" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-slate-400">Style</span>
                        <select value={level.lineStyle ?? 'solid'} onChange={(e) => updateFibLevel(index, { lineStyle: e.target.value as DrawingLineStyle })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white">
                          {LINE_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="mt-2 flex items-center justify-between rounded border border-slate-700 px-3 py-2">
                      <span className="text-slate-300">Visible</span>
                      <input type="checkbox" checked={level.visible !== false} onChange={(e) => updateFibLevel(index, { visible: e.target.checked })} />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {supportsRR && (
          <div className="rounded border border-slate-700 p-3">
            <div className="mb-2 text-slate-300">Risk:Reward</div>

            <label className="block mb-2">
              <span className="mb-1 block text-slate-300">Entry Price</span>
              <input
                type="number" step="0.0001"
                value={drawing.points[0]?.price ?? 0}
                onChange={(e) => {
                  const points = [...drawing.points];
                  if (points[0]) points[0] = { ...points[0], price: Number(e.target.value) };
                  updateSelectedDrawing({ points });
                }}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              />
            </label>

            <label className="block mb-2">
              <span className="mb-1 block text-slate-300">Stop Price</span>
              <input
                type="number" step="0.0001"
                value={drawing.points[1]?.price ?? 0}
                onChange={(e) => {
                  const points = [...drawing.points];
                  if (points[1]) points[1] = { ...points[1], price: Number(e.target.value) };
                  updateSelectedDrawing({ points });
                }}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              />
            </label>

            {drawing.points.length >= 3 ? (
              <label className="block mb-2">
                <span className="mb-1 block text-slate-300">Target Price</span>
                <input
                  type="number" step="0.0001"
                  value={drawing.points[2]?.price ?? 0}
                  onChange={(e) => {
                    const points = [...drawing.points];
                    if (points[2]) points[2] = { ...points[2], price: Number(e.target.value) };
                    updateSelectedDrawing({ points });
                  }}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
                />
              </label>
            ) : (
              <label className="block mb-2">
                <span className="mb-1 block text-slate-300">Reward Multiplier</span>
                <input
                  type="number" step="0.1" min={0}
                  value={drawing.rrMultiplier ?? 1}
                  onChange={(e) => updateSelectedDrawing({ rrMultiplier: Number(e.target.value) })}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
                />
              </label>
            )}

            <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
              <span className="text-slate-300">Show price labels</span>
              <input
                type="checkbox"
                checked={drawing.showPriceLabels ?? true}
                onChange={(e) => updateSelectedDrawing({ showPriceLabels: e.target.checked })}
              />
            </label>

            {drawing.points.length >= 2 && (
              <div className="mt-3 rounded bg-slate-800 px-3 py-2 text-slate-300">
                {(() => {
                  const entry = drawing.points[0].price;
                  const stop = drawing.points[1].price;
                  const risk = Math.abs(entry - stop);
                  let reward = 0;
                  if (drawing.points[2]) {
                    reward = Math.abs(drawing.points[2].price - entry);
                  } else {
                    reward = risk * (drawing.rrMultiplier ?? 2);
                  }
                  const rr = risk > 0 ? reward / risk : 0;
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between"><span>Risk:</span><span className="text-red-400 font-mono">{risk.toFixed(5)}</span></div>
                      <div className="flex justify-between"><span>Reward:</span><span className="text-green-400 font-mono">{reward.toFixed(5)}</span></div>
                      <div className="flex justify-between font-semibold"><span>R:R Ratio:</span><span className="text-blue-300 font-mono">1:{rr.toFixed(2)}</span></div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        <label className="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
          <span className="text-slate-300">Lock drawing</span>
          <input
            type="checkbox"
            checked={drawing.locked ?? false}
            onChange={(e) => updateSelectedDrawing({ locked: e.target.checked })}
          />
        </label>
      </div>
    </div>
  );
}
