# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (alerts API, WebSocket proxy)
│   └── deriv-chart/        # React + Vite trading chart frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Application: Deriv Trading Chart

A professional single-page TradingView-style charting platform for Deriv synthetic indices.

### Features
- **Real-time charts** via Deriv WebSocket API (`wss://ws.derivws.com/websockets/v3?app_id=1089`)
- **Assets**: Volatility 10/25/50/75/100, Boom 1000/500, Crash 1000/500, Jump 10/25/50/75/100
- **Timeframes**: 1s, 1m, 5m, 15m, 1h, 4h, 1d
- **Drawing tools**: Trendline, Horizontal Line, Fibonacci Retracement, Rectangle
- **Technical indicators**: MA, RSI, ATR
- **Chart replay mode**: Load historical data and replay forward
- **Price alerts**: Set price levels, browser notifications when triggered
- **Dark professional UI**: Dark trading terminal theme

### Frontend (artifacts/deriv-chart)
- React + Vite
- `lightweight-charts` (TradingView library) for charts
- `zustand` for state management
- Custom hooks: `useDerivWebSocket` for real-time data
- Components: `LightweightChart`, `DrawingOverlay`, `TopBar`, `LeftToolbar`, `RightPanel`

### Backend (artifacts/api-server)
- Express 5 REST API
- Routes: `GET /api/alerts`, `POST /api/alerts`, `DELETE /api/alerts/:id`
- PostgreSQL via Drizzle ORM
- Schema: `alertsTable` (id, symbol, price, condition, active, createdAt)

### WebSocket Data Flow
1. `useDerivWebSocket` hook connects to Deriv API WebSocket
2. Sends `ticks_history` request with `style: "candles"` and `subscribe: 1`
3. Receives `msg_type: "candles"` for historical data → `setData()` on chart series
4. Receives `msg_type: "ohlc"` for live updates → `update()` on chart series
5. Auto-reconnects every 3s on disconnect
