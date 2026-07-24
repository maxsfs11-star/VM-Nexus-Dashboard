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
  if (tenant.plan_status === "paused" || tenant.plan_status === "cancelled") return "blocked";
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
    const result = await pool.query(`SELECT t.id, t.name, t.slug, t.status, t.product_key, t.billing_status, t.due_date, t.grace_period_until,
      plan.id AS plan_id, plan.name AS plan_name, plan.slug AS plan_slug, plan.status AS plan_status, plan.features AS plan_features
      FROM nexus_tenants t
      LEFT JOIN LATERAL (SELECT p.id, p.name, p.slug, p.features, s.status FROM nexus_subscriptions s JOIN nexus_plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id ORDER BY s.started_at DESC LIMIT 1) plan ON TRUE
      WHERE t.slug = $1`, [slug]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado na VM Nexus." });
    const tenant = result.rows[0];
    return res.json({ tenantId: tenant.id, slug: tenant.slug, name: tenant.name, productKey: tenant.product_key, accessLevel: resolveAccess(tenant), status: tenant.status, billingStatus: tenant.billing_status, dueDate: tenant.due_date, gracePeriodUntil: tenant.grace_period_until, plan: tenant.plan_id ? { id: tenant.plan_id, name: tenant.plan_name, slug: tenant.plan_slug, status: tenant.plan_status, features: tenant.plan_features || {} } : null });
  } catch (error) { return next(error); }
});

export default router;
