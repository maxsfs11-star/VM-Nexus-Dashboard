import { Router } from "express";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";

const router = Router();

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function resolveAccess(tenant) {
  if (tenant.status === "suspended" || tenant.status === "closed") return "blocked";
  if (!tenant.due_date) return "full";
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = dateOnly(tenant.due_date);
  const gracePeriodUntil = dateOnly(tenant.grace_period_until);
  if (dueDate && today <= dueDate) return "full";
  if (gracePeriodUntil && today <= gracePeriodUntil) return "limited";
  return "blocked";
}

router.get("/tenant-access", async (req, res, next) => {
  try {
    if (!env.integrationSecret || req.headers["x-nexus-integration-key"] !== env.integrationSecret) return res.status(401).json({ error: "Chave de integração inválida." });
    const slug = String(req.query.slug || "").trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: "Identificador do tenant é obrigatório." });
    const result = await pool.query("SELECT id, name, slug, status, billing_status, due_date, grace_period_until FROM nexus_tenants WHERE slug = $1", [slug]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado na VM Nexus." });
    const tenant = result.rows[0];
    return res.json({ tenantId: tenant.id, slug: tenant.slug, name: tenant.name, accessLevel: resolveAccess(tenant), status: tenant.status, billingStatus: tenant.billing_status, dueDate: tenant.due_date, gracePeriodUntil: tenant.grace_period_until });
  } catch (error) { return next(error); }
});

export default router;
