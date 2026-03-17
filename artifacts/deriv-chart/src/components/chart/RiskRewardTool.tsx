import React, { useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface Props {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
}

export default function RiskRewardTool({ chart, series }: Props) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<number | ''>('');
  const [stop, setStop] = useState<number | ''>('');
  const [target, setTarget] = useState<number | ''>('');
  const priceLinesRef = useRef<{ stop?: any; target?: any } | null>(null);

  const clearLines = () => {
    if (!priceLinesRef.current) return;
    if (priceLinesRef.current.stop) {
      try { priceLinesRef.current.stop?.remove(); } catch {}
    }
    if (priceLinesRef.current.target) {
      try { priceLinesRef.current.target?.remove(); } catch {}
    }
    priceLinesRef.current = null;
  };

  const addLines = () => {
    clearLines();
    if (entry === '' || stop === '' || target === '') return;
    const e = Number(entry);
    const s = Number(stop);
    const t = Number(target);
    // create colored lines on the series
    const stopLine = series.createPriceLine({
      price: s,
      color: 'rgba(234, 84, 85, 0.95)',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `Stop ${s}`,
    });
    const targetLine = series.createPriceLine({
      price: t,
      color: 'rgba(52,211,153,0.95)',
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: `Target ${t}`,
    });
    priceLinesRef.current = { stop: stopLine, target: targetLine };

    // optionally add a lightweight annotation by drawing a simple price line title showing RR
    const risk = Math.abs(e - s);
    const reward = Math.abs(t - e);
    const rr = risk > 0 ? (reward / risk) : NaN;
    // set titles to include RR
    try {
      stopLine.applyOptions({ title: `Stop ${s} (risk)` });
      targetLine.applyOptions({ title: `Target ${t} (RR ${isFinite(rr) ? rr.toFixed(2) : '—'})` });
    } catch {
      // ignore
    }
  };

  const handleClear = () => {
    clearLines();
    setEntry('');
    setStop('');
    setTarget('');
  };

  return (
    <div className="bg-secondary/80 p-2 rounded-md shadow-md w-56 text-sm">
      <div className="flex items-center justify-between mb-2">
        <strong>Risk : Reward</strong>
        <button onClick={() => setOpen(o => !o)} className="text-xs text-muted-foreground">
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      {open ? (
        <>
          <label className="block text-xs">Entry</label>
          <input className="w-full mb-1 p-1 rounded bg-card text-sm" type="number" value={entry} onChange={e => setEntry(e.target.value === '' ? '' : Number(e.target.value))} />
          <label className="block text-xs">Stop</label>
          <input className="w-full mb-1 p-1 rounded bg-card text-sm" type="number" value={stop} onChange={e => setStop(e.target.value === '' ? '' : Number(e.target.value))} />
          <label className="block text-xs">Target</label>
          <input className="w-full mb-2 p-1 rounded bg-card text-sm" type="number" value={target} onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))} />

          <div className="flex gap-2">
            <button onClick={addLines} className="flex-1 bg-emerald-500 text-white rounded py-1 text-xs">Add</button>
            <button onClick={handleClear} className="flex-1 bg-rose-500 text-white rounded py-1 text-xs">Clear</button>
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">Manual entry UI — add stop & target lines.</div>
      )}
    </div>
  );
}