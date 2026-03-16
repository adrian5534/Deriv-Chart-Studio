import React, { useRef, useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ASSETS, TIMEFRAMES } from '../../lib/deriv-constants';
import { useChartStore } from '../../store/use-chart-store';
import { Play, Pause, Square, Rewind, Activity, Bell, FastForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import CreateAlertDialog from '../dialogs/CreateAlertDialog';
import { ChartRef } from '../chart/LightweightChart';

interface TopBarProps {
  chartRef: React.RefObject<ChartRef | null>;
}

export default function TopBar({ chartRef }: TopBarProps) {
  const symbol = useChartStore(s => s.symbol);
  const timeframe = useChartStore(s => s.timeframe);
  const setSymbol = useChartStore(s => s.setSymbol);
  const setTimeframe = useChartStore(s => s.setTimeframe);
  const connectionStatus = useChartStore(s => s.connectionStatus);
  const livePrice = useChartStore(s => s.livePrice);
  const replay = useChartStore(s => s.replay);
  const setReplayState = useChartStore(s => s.setReplayState);
  const stopReplay = useChartStore(s => s.stopReplay);

  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [replayDialogOpen, setReplayDialogOpen] = useState(false);
  const [replayDate, setReplayDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [isLoadingReplay, setIsLoadingReplay] = useState(false);

  const selectedAsset = ASSETS.find(a => a.symbol === symbol);

  // --- Enable timeframe switching in replay mode ---
  useEffect(() => {
    if (!replay.active) return;
    if (!chartRef.current) return;
    let cancelled = false;

    if (replay.date) {
      chartRef.current.loadReplayCandles(replay.date).then((candles) => {
        if (cancelled) return;
        if (!candles.length) return;
        setReplayState({
          ...replay,
          candles,
          index: Math.min(50, candles.length - 1),
        });
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);
  // -------------------------------------------------

  const handleStartReplay = async () => {
    if (!chartRef.current) return;
    setIsLoadingReplay(true);
    try {
      const candles = await chartRef.current.loadReplayCandles(replayDate);
      if (!candles.length) {
        alert('No data available for the selected date. Try a more recent date.');
        setIsLoadingReplay(false);
        return;
      }
      setReplayState({
        active: true,
        date: replayDate,
        playing: false,
        candles,
        index: Math.min(10, candles.length - 1), // start 50 candles in so there's something to see
      });
      setReplayDialogOpen(false);
    } finally {
      setIsLoadingReplay(false);
    }
  };

  const handleReplayPlay = () => setReplayState({ playing: true });
  const handleReplayPause = () => setReplayState({ playing: false });
  const handleStepForward = () => {
    const next = Math.min(replay.index + 1, replay.candles.length - 1);
    setReplayState({ index: next });
  };
  const handleExitReplay = () => stopReplay();

  const changeSpeed = (faster: boolean) => {
    const speeds = [2000, 1000, 500, 250, 100, 50];
    const cur = speeds.indexOf(replay.speed);
    const next = faster ? Math.min(cur + 1, speeds.length - 1) : Math.max(cur - 1, 0);
    setReplayState({ speed: speeds[next] });
  };

  const speedLabel = () => {
    const map: Record<number, string> = { 2000: '0.5×', 1000: '1×', 500: '2×', 250: '4×', 100: '10×', 50: '20×' };
    return map[replay.speed] ?? '1×';
  };

  return (
    <div className="h-14 bg-card border-b border-border flex items-center px-3 justify-between z-20 shrink-0 gap-2">
      {/* Left: Brand + asset + timeframe */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 mr-1 shrink-0">
          <Activity className="text-primary w-5 h-5" />
          <span className="font-bold text-base hidden sm:block tracking-tight">Deriv<span className="text-primary">Chart</span></span>
        </div>

        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-[160px] bg-secondary border-none h-8 text-sm font-medium shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {ASSETS.map(asset => (
              <SelectItem key={asset.symbol} value={asset.symbol}>
                {asset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="hidden md:flex bg-secondary rounded-md p-0.5 gap-0.5 shrink-0">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2.5 py-1 text-xs rounded transition-all font-medium ${
                timeframe === tf.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Center: Live price or Replay controls */}
      <div className="flex items-center gap-2">
        {replay.active ? (
          // REPLAY CONTROLS
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">
            <span className="text-amber-400 text-xs font-bold uppercase tracking-wide mr-1">Replay</span>

            <button
              onClick={() => changeSpeed(false)}
              className="text-amber-300 hover:text-amber-100 p-0.5 disabled:opacity-30"
              disabled={replay.speed === 2000}
              title="Slower"
            >
              <Rewind size={13} />
            </button>

            <span className="text-amber-300 text-xs font-mono w-8 text-center">{speedLabel()}</span>

            <button
              onClick={() => changeSpeed(true)}
              className="text-amber-300 hover:text-amber-100 p-0.5 disabled:opacity-30"
              disabled={replay.speed === 50}
              title="Faster"
            >
              <FastForward size={13} />
            </button>

            <div className="w-px h-4 bg-amber-500/30 mx-1" />

            {replay.playing ? (
              <button
                onClick={handleReplayPause}
                className="text-amber-300 hover:text-amber-100 p-0.5"
                title="Pause"
              >
                <Pause size={15} />
              </button>
            ) : (
              <button
                onClick={handleReplayPlay}
                className="text-amber-300 hover:text-amber-100 p-0.5"
                title="Play"
                disabled={replay.index >= replay.candles.length - 1}
              >
                <Play size={15} />
              </button>
            )}

            <button
              onClick={handleStepForward}
              className="text-amber-300 hover:text-amber-100 p-0.5"
              title="Step forward one candle"
              disabled={replay.index >= replay.candles.length - 1}
            >
              <span className="text-xs font-mono">+1</span>
            </button>

            <div className="w-px h-4 bg-amber-500/30 mx-1" />

            <span className="text-amber-300 text-xs font-mono">
              {replay.index}/{replay.candles.length}
            </span>

            <button
              onClick={handleExitReplay}
              className="ml-1 text-amber-400 hover:text-red-400 p-0.5"
              title="Exit replay"
            >
              <Square size={13} />
            </button>
          </div>
        ) : (
          // LIVE PRICE
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-xs text-muted-foreground font-semibold uppercase">{selectedAsset?.symbol}</span>
            <span className={`font-mono text-lg font-bold leading-none ${livePrice ? 'text-foreground' : 'text-muted-foreground'}`}>
              {livePrice ? livePrice.toFixed(selectedAsset?.pipSize ?? 4) : '—'}
            </span>
          </div>
        )}
      </div>

      {/* Right: Replay button + Add alert + connection status */}
      <div className="flex items-center gap-2 shrink-0">
        {!replay.active && (
          <Dialog open={replayDialogOpen} onOpenChange={setReplayDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 border-border/60 bg-secondary/60 text-sm h-8 hidden sm:flex">
                <Rewind size={13} />
                <span>Replay</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Chart Replay</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Select a date to replay historical candles for <strong>{selectedAsset?.name}</strong> from that point forward.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={replayDate}
                    max={new Date(Date.now() - 86400000).toISOString().split('T')[0]}
                    onChange={e => setReplayDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleStartReplay}
                  disabled={isLoadingReplay}
                >
                  {isLoadingReplay ? 'Loading candles...' : 'Start Replay'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="default" size="sm" className="gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-none h-8">
              <Bell size={13} />
              <span className="hidden sm:inline text-sm">Add Alert</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Price Alert</DialogTitle>
            </DialogHeader>
            <CreateAlertDialog onSuccess={() => setAlertDialogOpen(false)} />
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-1.5 text-xs font-medium bg-secondary/60 px-2.5 py-1.5 rounded-full">
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            connectionStatus === 'connected' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' :
            connectionStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
          }`} />
          <span className="hidden sm:block text-muted-foreground capitalize">{connectionStatus}</span>
        </div>
      </div>
    </div>
  );
}