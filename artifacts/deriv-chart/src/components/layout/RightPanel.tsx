import React, { useEffect, useRef, useState } from 'react';
import { useListAlerts, useDeleteAlert, getListAlertsQueryKey } from '@workspace/api-client-react';
import {
  Bell,
  Trash2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useChartStore } from '../../store/use-chart-store';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

const RIGHT_PANEL_STORAGE_KEY = 'deriv-chart:right-panel-collapsed';

export default function RightPanel() {
  const { data: alerts = [], isLoading } = useListAlerts();
  const deleteMutation = useDeleteAlert();
  const queryClient = useQueryClient();
  const livePrice = useChartStore((s) => s.livePrice);
  const symbol = useChartStore((s) => s.symbol);
  const { toast } = useToast();

  const lastPriceRef = useRef<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem(RIGHT_PANEL_STORAGE_KEY);
    setIsCollapsed(stored === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const handleDelete = (id: string) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        },
      },
    );
  };

  // Monitor live price against alerts
  useEffect(() => {
    if (!livePrice || !lastPriceRef.current || !alerts.length) {
      if (livePrice) lastPriceRef.current = livePrice;
      return;
    }

    const currentPrice = livePrice;
    const prevPrice = lastPriceRef.current;

    alerts.forEach((alert) => {
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
          title: 'Price Alert Triggered!',
          description: `${alert.symbol} crossed ${alert.condition} ${alert.price}`,
          variant: 'default',
          className: 'bg-primary text-primary-foreground border-none',
        });

        // Browser Notification
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification('DerivChart Alert', {
            body: `${alert.symbol} crossed ${alert.condition} ${alert.price}\nCurrent Price: ${currentPrice}`,
            icon: '/favicon.ico',
          });
        }

        // Delete alert after trigger to prevent spam (typical behavior)
        handleDelete(alert.id);
      }
    });

    lastPriceRef.current = currentPrice;
  }, [livePrice, alerts, symbol, toast]);

  return (
    <div
      className={`hidden xl:flex shrink-0 border-l border-border bg-card transition-all duration-200 ease-out ${
        isCollapsed ? 'w-12' : 'w-72'
      }`}
    >
      {isCollapsed ? (
        <div className="flex h-full w-full flex-col items-center py-3">
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            aria-label="Show alerts panel"
            className="mb-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Bell size={16} />
            <span className="rounded-full bg-secondary px-2 py-1 text-[10px]">
              {alerts.length}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Bell size={16} className="text-muted-foreground" />
              <span>Active Alerts</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">
                {alerts.length}
              </span>
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                aria-label="Hide alerts panel"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="flex justify-center p-8 text-muted-foreground">
                <AlertCircle className="animate-pulse" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Bell size={24} className="mx-auto mb-2 opacity-20" />
                <p>No active alerts.</p>
                <p className="mt-1 text-xs opacity-70">Right-click chart or use Top Bar to add one.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="group rounded-xl border border-border/50 bg-background p-3 shadow-sm transition-colors hover:border-border"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <span className="text-sm font-bold">{alert.symbol}</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(alert.id)}
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="mb-1 flex items-center gap-2 font-mono text-lg">
                      {alert.condition === 'above' ? (
                        <TrendingUp size={16} className="text-up" />
                      ) : (
                        <TrendingDown size={16} className="text-down" />
                      )}
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
      )}
    </div>
  );
}
