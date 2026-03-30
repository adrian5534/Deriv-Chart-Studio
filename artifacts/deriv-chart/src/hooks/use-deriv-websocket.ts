import { useEffect, useRef, useCallback } from 'react';
import { DERIV_WS_URL } from '../lib/deriv-constants';
import { useChartStore } from '../store/use-chart-store';
import { UTCTimestamp } from 'lightweight-charts';

export interface CandleData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface UseDerivWebSocketProps {
  onHistoricalData: (data: CandleData[]) => void;
  onLiveUpdate: (data: CandleData) => void;
  onAlertTriggered?: (alert: { symbol: string; price: number; condition: string }) => void;
}

let activeAudioContext: AudioContext | null = null;
let activeOscillators: OscillatorNode[] = [];
let heartbeatIntervalRef: ReturnType<typeof setInterval> | null = null;

const playHeartbeatSound = () => {
  try {
    // Stop any existing heartbeat
    if (heartbeatIntervalRef) {
      clearInterval(heartbeatIntervalRef);
      heartbeatIntervalRef = null;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    activeAudioContext = audioContext;

    const playBeat = () => {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);

        activeOscillators.push(oscillator);
      } catch (e) {
        console.error('Heartbeat beat failed:', e);
      }
    };

    // Play first beat immediately
    playBeat();

    // Play beats every 600ms (like a heartbeat)
    heartbeatIntervalRef = setInterval(playBeat, 600);
  } catch (e) {
    console.error('Heartbeat sound failed:', e);
  }
};

export const stopAlertSound = () => {
  try {
    if (heartbeatIntervalRef) {
      clearInterval(heartbeatIntervalRef);
      heartbeatIntervalRef = null;
    }
    activeOscillators.forEach(osc => {
      try {
        osc.stop();
      } catch {
        // Already stopped
      }
    });
    activeOscillators = [];
    if (activeAudioContext) {
      activeAudioContext.close();
      activeAudioContext = null;
    }
  } catch (e) {
    console.error('Stop alert sound failed:', e);
  }
};

// Simple in-memory historical cache keyed by `${symbol}_${timeframe}`
const historicalCache = new Map<string, CandleData[]>();

export function useDerivWebSocket({ onHistoricalData, onLiveUpdate, onAlertTriggered }: UseDerivWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);
  const lastRequestedRef = useRef<{ symbol: string; timeframe: number } | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredAlertsRef = useRef<Set<string>>(new Set()); // Track triggered alerts to prevent repeats

  const symbol = useChartStore(s => s.symbol);
  const timeframe = useChartStore(s => s.timeframe);
  const replayActive = useChartStore(s => s.replay.active);
  const setLivePrice = useChartStore(s => s.setLivePrice);
  const setConnectionStatus = useChartStore(s => s.setConnectionStatus);

  const cacheKey = (s: string, tf: number) => `${s}_${tf}`;

  const sendMsg = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const checkAndTriggerAlerts = useCallback((price: number, sym: string) => {
    const { alerts } = useChartStore.getState();

    for (const alert of alerts) {
      if (alert.symbol !== sym) continue;

      const triggered =
        (alert.condition === 'above' && price >= alert.price) ||
        (alert.condition === 'below' && price <= alert.price);

      if (triggered) {
        const alertKey = `${alert.id}-${alert.price}`;
        
        // Only trigger once per alert
        if (!triggeredAlertsRef.current.has(alertKey)) {
          triggeredAlertsRef.current.add(alertKey);

          // Play heartbeat if enabled
          if (alert.soundEnabled) {
            playHeartbeatSound();
          }

          // Emit alert event to show popup
          if (onAlertTriggered) {
            onAlertTriggered({
              symbol: sym,
              price: alert.price,
              condition: alert.condition,
            });
          }

          // Show OS notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Alert: ${sym}`, {
              body: `Price reached ${alert.price}`,
              icon: '/favicon.ico',
            });
          }
        }
      }
    }
  }, [onAlertTriggered]);

  const subscribeToAsset = useCallback(() => {
    // Clear triggered alerts when changing asset
    triggeredAlertsRef.current.clear();

    // If replay is active, don't subscribe to the live stream.
    // This prevents duplicate subscribe requests and avoids overwriting replay data.
    if (useChartStore.getState().replay?.active) {
      // Remember what we requested so repeated calls while replay are ignored
      lastRequestedRef.current = { symbol, timeframe };
      return;
    }

    // Avoid sending duplicate subscribe requests for same symbol/timeframe
    const last = lastRequestedRef.current;
    if (last && last.symbol === symbol && last.timeframe === timeframe && subscriptionIdRef.current) {
      // Already subscribed to this exact stream — skip
      return;
    }

    // If we have cached historical data for this symbol/timeframe, deliver it synchronously
    try {
      const key = cacheKey(symbol, timeframe);
      const cached = historicalCache.get(key);
      if (cached && cached.length) {
        onHistoricalData(cached);
      }
    } catch {
      // ignore cache delivery errors
    }

    // Unsubscribe previous stream
    if (subscriptionIdRef.current) {
      sendMsg({ forget: subscriptionIdRef.current });
      subscriptionIdRef.current = null;
    }

    // Remember what we requested so repeated calls don't resubscribe
    lastRequestedRef.current = { symbol, timeframe };

    // Request 1000 historical candles + subscribe to live stream
    sendMsg({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 1000,
      end: 'latest',
      start: 1,
      style: 'candles',
      granularity: timeframe,
      subscribe: 1,
    });
  }, [symbol, timeframe, sendMsg, onHistoricalData]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(DERIV_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      subscribeToAsset();
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        if (data.error) {
          const msgText = String(data.error?.message || data.error);
          // Ignore duplicate-subscribe errors from server (harmless)
          if (msgText.toLowerCase().includes('already subscribed')) {
            console.debug('[Deriv WS] already subscribed -> ignoring duplicate subscribe');
            return;
          }
          console.warn('[Deriv WS] Error:', data.error.message || data.error);
          return;
        }

        if (data.msg_type === 'candles') {
          const candles: CandleData[] = (data.candles || []).map((c: any) => ({
            time: Number(c.epoch) as UTCTimestamp,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
          }));

          // cache and forward historical payload
          try {
            historicalCache.set(cacheKey(symbol, timeframe), candles);
          } catch {
            // ignore cache errors
          }

          if (data.subscription?.id) {
            subscriptionIdRef.current = data.subscription.id;
          }
          onHistoricalData(candles);
        }
        else if (data.msg_type === 'ohlc') {
          const c = data.ohlc;
          const liveCandle: CandleData = {
            time: Number(c.open_time) as UTCTimestamp,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
          };
          const closePrice = parseFloat(c.close);
          setLivePrice(closePrice);

          checkAndTriggerAlerts(closePrice, symbol);

          if (!replayActive) {
            onLiveUpdate(liveCandle);
          }
        }
      } catch (e) {
        console.warn('[Deriv WS] Parse error', e);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      lastRequestedRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };
  }, [symbol, timeframe, subscribeToAsset, setConnectionStatus, setLivePrice, replayActive, onHistoricalData, onLiveUpdate, checkAndTriggerAlerts]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        if (subscriptionIdRef.current) {
          sendMsg({ forget: subscriptionIdRef.current });
        }
        lastRequestedRef.current = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      subscribeToAsset();
    }
  }, [symbol, timeframe, subscribeToAsset]);

  const loadReplayCandles = useCallback((date: string): Promise<CandleData[]> => {
    return new Promise((resolve) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        resolve([]);
        return;
      }

      const startEpoch = Math.floor(new Date(date).getTime() / 1000);
      const endEpoch = Math.floor(Date.now() / 1000);
      const reqId = Math.floor(Math.random() * 1000000) + 10000; // unique ID each time

      const handler = (msg: MessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.msg_type === 'candles' && data.req_id === reqId) {
            wsRef.current?.removeEventListener('message', handler);
            const candles: CandleData[] = (data.candles || []).map((c: any) => ({
              time: Number(c.epoch) as UTCTimestamp,
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
            }));

            // store into cache for immediate reuse
            try {
              historicalCache.set(cacheKey(symbol, timeframe), candles);
            } catch {
              // ignore cache errors
            }

            resolve(candles);
          }
        } catch {
          resolve([]);
        }
      };

      wsRef.current.addEventListener('message', handler);

      wsRef.current.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        start: startEpoch,
        end: endEpoch,
        style: 'candles',
        granularity: timeframe,
        req_id: reqId,
      }));

      setTimeout(() => {
        wsRef.current?.removeEventListener('message', handler);
        resolve([]);
      }, 8000);
    });
  }, [symbol, timeframe]);

  const getCachedHistorical = useCallback((s: string, tf: number) => {
    try {
      return historicalCache.get(cacheKey(s, tf)) ?? null;
    } catch {
      return null;
    }
  }, []);

  return { loadReplayCandles, getCachedHistorical };
}