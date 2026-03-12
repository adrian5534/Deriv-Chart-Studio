import React, { useEffect, useRef } from 'react';
import { useListAlerts, useDeleteAlert, getListAlertsQueryKey } from '@workspace/api-client-react';
import { Bell, Trash2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useChartStore } from '../../store/use-chart-store';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

export default function RightPanel() {
  const { data: alerts = [], isLoading } = useListAlerts();
  const deleteMutation = useDeleteAlert();
  const queryClient = useQueryClient();
  const livePrice = useChartStore(s => s.livePrice);
  const symbol = useChartStore(s => s.symbol);
  const { toast } = useToast();
  
  const lastPriceRef = useRef<number | null>(null);

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
      }
    });
  };

  // Monitor live price against alerts
  useEffect(() => {
    if (!livePrice || !lastPriceRef.current || !alerts.length) {
       if (livePrice) lastPriceRef.current = livePrice;
       return;
    }

    const currentPrice = livePrice;
    const prevPrice = lastPriceRef.current;

    alerts.forEach(alert => {
      if (!alert.active || alert.symbol !== symbol) return;

      let triggered = false;
      if (alert.condition === 'above' && prevPrice <= alert.price && currentPrice > alert.price) {
        triggered = true;
      } else if (alert.condition === 'below' && prevPrice >= alert.price && currentPrice < alert.price) {
        triggered = true;
      }

      if (triggered) {
        // Show Toast
        toast({
          title: `Price Alert Triggered!`,
          description: `${alert.symbol} crossed ${alert.condition} ${alert.price}`,
          variant: "default",
          className: "bg-primary text-primary-foreground border-none"
        });

        // Browser Notification
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('DerivChart Alert', {
            body: `${alert.symbol} crossed ${alert.condition} ${alert.price}\nCurrent Price: ${currentPrice}`,
            icon: '/favicon.ico'
          });
        }

        // Delete alert after trigger to prevent spam (typical behavior)
        handleDelete(alert.id);
      }
    });

    lastPriceRef.current = currentPrice;
  }, [livePrice, alerts, symbol]);

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col z-20 hidden xl:flex">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Bell size={16} className="text-muted-foreground" />
          <span>Active Alerts</span>
        </div>
        <span className="text-xs bg-secondary px-2 py-1 rounded-full text-muted-foreground">{alerts.length}</span>
      </div>

      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="flex justify-center p-8 text-muted-foreground"><AlertCircle className="animate-pulse" /></div>
        ) : alerts.length === 0 ? (
          <div className="text-center p-6 text-sm text-muted-foreground">
            <Bell size={24} className="mx-auto mb-2 opacity-20" />
            <p>No active alerts.</p>
            <p className="text-xs mt-1 opacity-70">Right-click chart or use Top Bar to add one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map(alert => (
              <div 
                key={alert.id} 
                className="bg-background rounded-xl p-3 border border-border/50 shadow-sm hover:border-border transition-colors group"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-sm">{alert.symbol}</span>
                  <button 
                    onClick={() => handleDelete(alert.id)}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                
                <div className="flex items-center gap-2 text-lg font-mono mb-1">
                  {alert.condition === 'above' ? <TrendingUp size={16} className="text-up" /> : <TrendingDown size={16} className="text-down" />}
                  <span className={alert.condition === 'above' ? 'text-up' : 'text-down'}>
                    {alert.price}
                  </span>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Added {format(new Date(alert.createdAt), 'MMM d, HH:mm')}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
