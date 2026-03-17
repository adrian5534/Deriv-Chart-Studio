import React, { useRef, useState } from 'react';
import { useChartStore } from '../../store/use-chart-store';

export default function RiskRewardTool() {
  const chartRef = (useChartStore.getState() as any)?.chartRef;
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<number | ''>('');
  const [stop, setStop] = useState<number | ''>('');
  const [target, setTarget] = useState<number | ''>('');
  const linesRef = useRef<{ stop?: any; target?: any } | null>(null);

  const getSeries = () => {
    try {
      return chartRef?.getSeries?.() ?? null;
    } catch {
      return null;
    }
  };

  const clearLines = () => {
    const series = getSeries();
    if (!series || !linesRef.current) return;
    try { linesRef.current.stop?.remove?.(); } catch {}
    try { linesRef.current.target?.remove?.(); } catch {}
    linesRef.current = null;
  };

  const applyLines = () => {
    clearLines();
    const series = getSeries();
    if (!series) return;
    if (entry === '' || stop === '' || target === '') return;
    const e = Number(entry);
    const s = Number(stop);
    const t = Number(target);

    const stopLine = series.createPriceLine?.({
      price: s,
      color: 'rgba(234,84,85,0.95)',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `Stop ${s}`,
    });
    const targetLine = series.createPriceLine?.({
      price: t,
      color: 'rgba(52,211,153,0.95)',
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: `Target ${t}`,
    });

    linesRef.current = { stop: stopLine, target: targetLine };

    const risk = Math.abs(e - s);
    const reward = Math.abs(t - e);
    const rr = risk > 0 ? (reward / risk) : NaN;
    try {
      stopLine?.applyOptions?.({ title: `Stop ${s} (risk)` });
      targetLine?.applyOptions?.({ title: `Target ${t} (RR ${isFinite(rr) ? rr.toFixed(2) : '—'})` });
    } catch {}
  };

  return (
    <div className="p-3 bg-card border border-border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <strong className="text-sm">Risk : Reward</strong>
        <button
          onClick={() => setOpen(v => !v)}
          className="text-xs text-muted-foreground"
        >
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      {open ? (
        <>
          <label className="text-xs">Entry</label>
          <input
            className="w-full mb-1 p-1 rounded bg-secondary text-sm"
            type="number"
            value={entry}
            onChange={e => setEntry(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <label className="text-xs">Stop</label>
          <input
            className="w-full mb-1 p-1 rounded bg-secondary text-sm"
            type="number"
            value={stop}
            onChange={e => setStop(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <label className="text-xs">Target</label>
          <input
            className="w-full mb-2 p-1 rounded bg-secondary text-sm"
            type="number"
            value={target}
            onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))}
          />

          <div className="flex gap-2">
            <button onClick={applyLines} className="flex-1 bg-emerald-500 text-white rounded py-1 text-xs">Add</button>
            <button onClick={() => { clearLines(); setEntry(''); setStop(''); setTarget(''); }} className="flex-1 bg-rose-500 text-white rounded py-1 text-xs">Clear</button>
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">Open to add stop/target lines on the chart.</div>
      )}
    </div>
  );
}