import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    service: "api-server",
    status: "ok",
    routes: ["/api/healthz", "/api/alerts"],
  });
});

app.get("/api", (_req, res) => {
  res.json({
    status: "ok",
    routes: ["/api/healthz", "/api/alerts"],
  });
});

app.use("/api", router);

export default app;
