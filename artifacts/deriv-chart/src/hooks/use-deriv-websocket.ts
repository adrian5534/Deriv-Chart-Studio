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

export function useDerivWebSocket({ onHistoricalData, onLiveUpdate, onAlertTriggered }: UseDerivWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredAlertsRef = useRef<Set<string>>(new Set()); // Track triggered alerts to prevent repeats

  const symbol = useChartStore(s => s.symbol);
  const timeframe = useChartStore(s => s.timeframe);
  const replayActive = useChartStore(s => s.replay.active);
  const setLivePrice = useChartStore(s => s.setLivePrice);
  const setConnectionStatus = useChartStore(s => s.setConnectionStatus);

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

    // Unsubscribe previous stream
    if (subscriptionIdRef.current) {
      sendMsg({ forget: subscriptionIdRef.current });
      subscriptionIdRef.current = null;
    }

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
  }, [symbol, timeframe, sendMsg]);

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
          console.warn('[Deriv WS] Error:', data.error.message);
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
          if (data.subscription?.id) {
            subscriptionIdRef.current = data.subscription.id;
          }
          const normalized = normalizeCandlesToSeconds(data);
          onHistoricalData?.(normalized);
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
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
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
      const reqId = 9999;

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

  return { loadReplayCandles };
}

/**
 * Normalize incoming candles to consistent shape and seconds-based epoch.
 */
function normalizeCandlesToSeconds(candles: any[]): CandleData[] {
  return candles
    .map((c: any) => {
      // try common time fields
      let t: any = c.time ?? c.epoch ?? c.timestamp ?? c.date ?? c[0] ?? null;
      if (typeof t === 'string') {
        const parsed = Date.parse(t);
        t = Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Number(t));
      } else if (typeof t === 'number') {
        // convert ms -> seconds when necessary
        t = t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
      } else {
        t = null;
      }

      return {
        time: t,
        open: Number(c.open ?? c.o ?? c.O ?? c[1] ?? 0),
        high: Number(c.high ?? c.h ?? c.H ?? c[2] ?? 0),
        low: Number(c.low ?? c.l ?? c.L ?? c[3] ?? 0),
        close: Number(c.close ?? c.c ?? c.C ?? c[4] ?? 0),
        volume: Number(c.volume ?? c.v ?? c[5] ?? 0),
      } as CandleData;
    })
    .filter((c) => c.time != null); // drop invalid items
}

/**
 * Robust websocket message handler - tolerant to single-object or array payloads
 */
function handleWsMessage(
  ev: MessageEvent,
  onHistoricalData?: (data: CandleData[]) => void,
  onLiveUpdate?: (data: CandleData) => void
) {
  let parsed: any;
  try {
    parsed = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
  } catch (err) {
    console.error('[Deriv WS] JSON parse error', err, ev.data);
    return;
  }

  // Detect payload candidates used by different endpoints/providers
  const candidate = parsed?.candles ?? parsed?.history ?? parsed?.data ?? parsed?.subscription ?? parsed?.msg ?? parsed;

  // Normalize to array
  let rawArray: any[] = [];
  if (Array.isArray(candidate)) rawArray = candidate;
  else if (candidate && typeof candidate === 'object') {
    // if object contains nested array fields, prefer them
    if (Array.isArray(candidate.candles)) rawArray = candidate.candles;
    else if (Array.isArray(candidate.history)) rawArray = candidate.history;
    else if (Array.isArray(candidate.data)) rawArray = candidate.data;
    else rawArray = [candidate];
  } else {
    // nothing useful
    return;
  }

  // Defensive: ensure we actually have array items before mapping
  if (!rawArray.length) return;

  const normalized = normalizeCandlesToSeconds(rawArray);

  // Decide whether this is historical vs live update:
  // - If payload contained multiple candles -> treat as historical/full update
  // - If single candle -> treat as live update
  if (normalized.length > 1) {
    try { onHistoricalData?.(normalized); } catch (e) { console.error('[Deriv WS] onHistoricalData handler error', e); }
  } else {
    try { onLiveUpdate?.(normalized[0]); } catch (e) { console.error('[Deriv WS] onLiveUpdate handler error', e); }
  }
}