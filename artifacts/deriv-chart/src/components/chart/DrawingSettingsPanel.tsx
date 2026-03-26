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
    <div className="absolute right-3 top-3 bottom-3 z-20 w-80 overflow-y-auto rounded-lg border border-border bg-card p-4 text-sm text-foreground shadow-xl" style={{ resize: 'both' }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-foreground">{formatDrawingType(drawing.type)}</div>
          <div className="text-sm text-muted-foreground">Selected drawing</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { removeDrawing(drawing.id); setSelectedDrawingId(null); }}
            className="rounded px-3 py-1 text-sm text-destructive hover:bg-destructive/10"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedDrawingId(null)}
            className="rounded px-3 py-1 text-sm text-muted-foreground hover:bg-secondary"
          >
            Close
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-foreground">Color</span>
          <input
            type="color"
            value={drawing.color ?? '#2962FF'}
            onChange={(e) => updateSelectedDrawing({ color: e.target.value })}
            className="h-10 w-full cursor-pointer rounded border border-border bg-secondary"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-foreground">Line width</span>
          <input
            type="range" min={1} max={8} step={1}
            value={drawing.lineWidth ?? 2}
            onChange={(e) => updateSelectedDrawing({ lineWidth: Number(e.target.value) })}
            className="w-full"
          />
          <div className="mt-1 text-xs text-muted-foreground">{drawing.lineWidth ?? 2}px</div>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-foreground">Line style</span>
          <select
            value={drawing.lineStyle ?? 'solid'}
            onChange={(e) => updateSelectedDrawing({ lineStyle: e.target.value as DrawingLineStyle })}
            className="w-full rounded border border-border bg-secondary px-3 py-2 text-foreground capitalize"
          >
            {LINE_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
          </select>
        </label>

        {supportsFill && (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">Fill opacity</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={drawing.fillOpacity ?? 0.12}
              onChange={(e) => updateSelectedDrawing({ fillOpacity: Number(e.target.value) })}
              className="w-full"
            />
            <div className="mt-1 text-xs text-muted-foreground">{Math.round((drawing.fillOpacity ?? 0.12) * 100)}%</div>
          </label>
        )}

        <div className="rounded border border-border bg-secondary/50 p-3">
          <div className="mb-3 text-sm font-medium text-foreground">Labels</div>
          <label className="mb-2 flex items-center justify-between rounded border border-border bg-background px-3 py-2">
            <span className="text-sm text-foreground">Show price labels</span>
            <input
              type="checkbox"
              checked={drawing.showPriceLabels ?? (drawing.type === 'hline')}
              onChange={(e) => updateSelectedDrawing({ showPriceLabels: e.target.checked })}
            />
          </label>

          {supportsFib && (
            <label className="mb-2 block">
              <span className="mb-2 block text-sm font-medium text-foreground">Fib label content</span>
              <select
                value={(drawing as any).fibLabelMode ?? 'percent'}
                onChange={(e) => updateSelectedDrawing({ fibLabelMode: e.target.value as FibLabelMode } as any)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-foreground capitalize"
              >
                {FIB_LABEL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">Horizontal</span>
              <select
                value={drawing.labelHorizontalAlign ?? 'right'}
                onChange={(e) => updateSelectedDrawing({ labelHorizontalAlign: e.target.value as DrawingLabelHorizontalAlign })}
                className="w-full rounded border border-border bg-background px-2 py-2 text-foreground capitalize text-xs"
              >
                {LABEL_HORIZONTAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">Vertical</span>
              <select
                value={drawing.labelVerticalAlign ?? 'top'}
                onChange={(e) => updateSelectedDrawing({ labelVerticalAlign: e.target.value as DrawingLabelVerticalAlign })}
                className="w-full rounded border border-border bg-background px-2 py-2 text-foreground capitalize text-xs"
              >
                {LABEL_VERTICAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="rounded border border-border bg-secondary/50 p-3">
          <div className="mb-3 text-sm font-medium text-foreground">Visible on timeframes</div>
          <label className="mb-3 flex items-center justify-between rounded border border-border bg-background px-3 py-2">
            <span className="text-sm text-foreground">Show on all</span>
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
                  className={`rounded border px-2 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-secondary'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {!showOnAllTimeframes && visibleTimeframes.length === 0 && (
            <div className="mt-2 text-xs text-amber-600">No timeframe selected.</div>
          )}
        </div>

        {supportsFib && (
          <>
            <div className="rounded border border-border bg-secondary/50 p-3">
              <div className="mb-3 text-sm font-medium text-foreground">Fibonacci settings</div>
              <div className="space-y-2">
                {[
                  { key: 'fibReverse', label: 'Reverse levels' },
                  { key: 'fibExtendLeft', label: 'Extend left' },
                  { key: 'fibExtendRight', label: 'Extend right', defaultVal: true },
                  { key: 'fibShowLabels', label: 'Show fib labels', defaultVal: true },
                ].map(({ key, label, defaultVal }) => (
                  <label key={key} className="flex items-center justify-between rounded border border-border bg-background px-3 py-2">
                    <span className="text-sm text-foreground">{label}</span>
                    <input
                      type="checkbox"
                      checked={(drawing as any)[key] ?? (defaultVal ?? false)}
                      onChange={(e) => updateSelectedDrawing({ [key]: e.target.checked } as any)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded border border-border bg-secondary/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">Fib levels</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateSelectedDrawing({ fibLevels: [...fibLevels, { value: 1.272, label: '127.2%', color: drawing.color ?? '#2962FF', visible: true, lineStyle: 'dashed' as DrawingLineStyle }].sort((a, b) => a.value - b.value) } as any)}
                    className="rounded bg-primary/20 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectedDrawing({ fibLevels: DEFAULT_FIB_LEVELS.map((l) => ({ ...l })) } as any)}
                    className="rounded bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary/80"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {fibLevels.map((level, index) => (
                  <div key={`${index}-${level.value}`} className="rounded border border-border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-medium text-foreground">Level {index + 1}</div>
                      <button
                        type="button"
                        onClick={() => removeFibLevel(index)}
                        className="text-xs font-medium text-destructive hover:text-destructive/80"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Ratio</span>
                        <input
                          type="number"
                          step="0.001"
                          value={level.value}
                          onChange={(e) => updateFibLevel(index, { value: Number(e.target.value) })}
                          className="w-full rounded border border-border bg-secondary px-2 py-2 text-foreground text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Label</span>
                        <input
                          type="text"
                          value={level.label ?? ''}
                          onChange={(e) => updateFibLevel(index, { label: e.target.value })}
                          className="w-full rounded border border-border bg-secondary px-2 py-2 text-foreground text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Color</span>
                        <input
                          type="color"
                          value={level.color ?? drawing.color ?? '#2962FF'}
                          onChange={(e) => updateFibLevel(index, { color: e.target.value })}
                          className="h-8 w-full rounded border border-border bg-secondary"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Style</span>
                        <select
                          value={level.lineStyle ?? 'solid'}
                          onChange={(e) => updateFibLevel(index, { lineStyle: e.target.value as DrawingLineStyle })}
                          className="w-full rounded border border-border bg-secondary px-2 py-2 text-foreground capitalize text-xs"
                        >
                          {LINE_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="mt-2 flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2">
                      <span className="text-sm text-foreground">Visible</span>
                      <input
                        type="checkbox"
                        checked={level.visible !== false}
                        onChange={(e) => updateFibLevel(index, { visible: e.target.checked })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {supportsRR && (
          <div className="rounded border border-border bg-secondary/50 p-3">
            <div className="mb-3 text-sm font-medium text-foreground">Risk:Reward</div>

            <label className="block mb-2">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">Entry Price</span>
              <input
                type="number"
                step="0.0001"
                value={drawing.points[0]?.price ?? 0}
                onChange={(e) => {
                  const points = [...drawing.points];
                  if (points[0]) points[0] = { ...points[0], price: Number(e.target.value) };
                  updateSelectedDrawing({ points });
                }}
                className="w-full rounded border border-border bg-background px-3 py-2 text-foreground text-xs font-mono"
              />
            </label>

            <label className="block mb-2">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">Stop Price</span>
              <input
                type="number"
                step="0.0001"
                value={drawing.points[1]?.price ?? 0}
                onChange={(e) => {
                  const points = [...drawing.points];
                  if (points[1]) points[1] = { ...points[1], price: Number(e.target.value) };
                  updateSelectedDrawing({ points });
                }}
                className="w-full rounded border border-border bg-background px-3 py-2 text-foreground text-xs font-mono"
              />
            </label>

            {drawing.points.length >= 3 ? (
              <label className="block mb-2">
                <span className="mb-2 block text-xs font-medium text-muted-foreground">Target Price</span>
                <input
                  type="number"
                  step="0.0001"
                  value={drawing.points[2]?.price ?? 0}
                  onChange={(e) => {
                    const points = [...drawing.points];
                    if (points[2]) points[2] = { ...points[2], price: Number(e.target.value) };
                    updateSelectedDrawing({ points });
                  }}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-foreground text-xs font-mono"
                />
              </label>
            ) : (
              <label className="block mb-2">
                <span className="mb-2 block text-xs font-medium text-muted-foreground">Reward Multiplier</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={drawing.rrMultiplier ?? 1}
                  onChange={(e) => updateSelectedDrawing({ rrMultiplier: Number(e.target.value) })}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-foreground text-xs font-mono"
                />
              </label>
            )}

            <label className="mb-3 flex items-center justify-between rounded border border-border bg-background px-3 py-2">
              <span className="text-sm text-foreground">Show price labels</span>
              <input
                type="checkbox"
                checked={drawing.showPriceLabels ?? true}
                onChange={(e) => updateSelectedDrawing({ showPriceLabels: e.target.checked })}
              />
            </label>

            {drawing.points.length >= 2 && (
              <div className="rounded bg-primary/10 px-3 py-2 border border-primary/20">
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
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Risk:</span>
                        <span className="text-destructive font-mono font-semibold">{risk.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reward:</span>
                        <span className="text-green-600 font-mono font-semibold">{reward.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-primary/20">
                        <span className="text-foreground font-medium">R:R Ratio:</span>
                        <span className="text-primary font-mono font-semibold">1:{rr.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        <label className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2">
          <span className="text-sm text-foreground">Lock drawing</span>
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