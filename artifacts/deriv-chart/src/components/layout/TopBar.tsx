import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ASSETS, TIMEFRAMES } from '../../lib/deriv-constants';
import { useChartStore } from '../../store/use-chart-store';
import { Play, Pause, Rewind, Activity, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import CreateAlertDialog from '../dialogs/CreateAlertDialog';

export default function TopBar() {
  const symbol = useChartStore(s => s.symbol);
  const timeframe = useChartStore(s => s.timeframe);
  const setSymbol = useChartStore(s => s.setSymbol);
  const setTimeframe = useChartStore(s => s.setTimeframe);
  const connectionStatus = useChartStore(s => s.connectionStatus);
  const livePrice = useChartStore(s => s.livePrice);
  
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);

  const selectedAsset = ASSETS.find(a => a.symbol === symbol);

  return (
    <div className="h-14 bg-card border-b border-border flex items-center px-4 justify-between z-20">
      <div className="flex items-center gap-4">
        {/* Logo/Brand */}
        <div className="flex items-center gap-2 mr-4">
          <Activity className="text-primary w-6 h-6" />
          <span className="font-bold text-lg hidden sm:block tracking-tight">Deriv<span className="text-primary">Chart</span></span>
        </div>

        {/* Asset Selector */}
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-[180px] bg-secondary border-none h-9 font-medium">
            <SelectValue placeholder="Select Asset" />
          </SelectTrigger>
          <SelectContent>
            {ASSETS.map(asset => (
              <SelectItem key={asset.symbol} value={asset.symbol}>
                {asset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Timeframe Selector */}
        <div className="hidden md:flex bg-secondary rounded-md p-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-3 py-1 text-sm rounded-sm transition-all ${
                timeframe === tf.value 
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Live Price Display */}
        <div className="flex flex-col items-end mr-4 hidden lg:flex">
          <span className="text-xs text-muted-foreground uppercase font-semibold">{selectedAsset?.symbol}</span>
          <span className={`font-mono text-lg font-bold leading-none ${livePrice ? 'text-foreground' : 'text-muted-foreground'}`}>
            {livePrice ? livePrice.toFixed(selectedAsset?.pipSize || 2) : 'Loading...'}
          </span>
        </div>

        {/* Replay Mode Toggle (Visual Only for UI completeness) */}
        <Button variant="outline" size="sm" className="hidden sm:flex gap-2 border-border/50 bg-secondary/50 hover:bg-secondary">
          <Rewind size={14} />
          <span>Replay</span>
        </Button>

        {/* Alert Button */}
        <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="default" size="sm" className="gap-2 bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-none">
              <Bell size={14} />
              <span className="hidden sm:inline">Add Alert</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Price Alert</DialogTitle>
            </DialogHeader>
            <CreateAlertDialog onSuccess={() => setAlertDialogOpen(false)} />
          </DialogContent>
        </Dialog>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-xs font-medium bg-secondary/50 px-3 py-1.5 rounded-full">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-up shadow-[0_0_8px_rgba(38,166,154,0.6)]' :
            connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-destructive'
          }`} />
          <span className="hidden sm:block text-muted-foreground capitalize">{connectionStatus}</span>
        </div>
      </div>
    </div>
  );
}
