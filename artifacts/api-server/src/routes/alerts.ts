import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateAlertBody, DeleteAlertParams } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// GET /api/alerts - List all active alerts
router.get("/alerts", async (_req, res) => {
  const alerts = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.active, true))
    .orderBy(alertsTable.createdAt);

  const formatted = alerts.map((a) => ({
    id: a.id,
    symbol: a.symbol,
    price: parseFloat(a.price),
    condition: a.condition,
    active: a.active,
    createdAt: a.createdAt.toISOString(),
  }));

  res.json(formatted);
});

// POST /api/alerts - Create a new price alert
router.post("/alerts", async (req, res) => {
  const body = CreateAlertBody.parse(req.body);

  const newAlert = {
    id: randomUUID(),
    symbol: body.symbol,
    price: body.price.toString(),
    condition: body.condition,
    active: true,
  };

  await db.insert(alertsTable).values(newAlert);

  const created = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.id, newAlert.id))
    .then((rows) => rows[0]);

  res.status(201).json({
    id: created.id,
    symbol: created.symbol,
    price: parseFloat(created.price),
    condition: created.condition,
    active: created.active,
    createdAt: created.createdAt.toISOString(),
  });
});

// DELETE /api/alerts/:id - Delete a price alert
router.delete("/alerts/:id", async (req, res) => {
  const { id } = DeleteAlertParams.parse(req.params);

  await db.delete(alertsTable).where(eq(alertsTable.id, id));

  res.json({ success: true });
});

export default router;
