import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

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

function withAccess(tenant) {
  return { ...tenant, access_level: resolveAccess(tenant) };
}

router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT t.id, t.name, t.slug, t.product_key, t.status, t.billing_status, t.due_date, t.grace_period_until, t.created_at, COUNT(u.id)::int AS units FROM nexus_tenants t LEFT JOIN nexus_units u ON u.tenant_id = t.id GROUP BY t.id ORDER BY t.created_at DESC`);
    return res.json({ tenants: result.rows.map(withAccess) });
  } catch (error) { return next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const slug = String(req.body?.slug || "").trim().toLowerCase();
    const productKey = String(req.body?.productKey || "mesamanda").trim().toLowerCase();
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador do tenant são obrigatórios." });
    const result = await pool.query("INSERT INTO nexus_tenants (name, slug, product_key) VALUES ($1, $2, $3) RETURNING id, name, slug, product_key, status, billing_status, due_date, grace_period_until, created_at", [name, slug, productKey]);
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "tenant.created", "tenant", result.rows[0].id, JSON.stringify({ name, slug, productKey })]);
    return res.status(201).json({ tenant: withAccess(result.rows[0]) });
  } catch (error) { return next(error); }
});

router.put("/:tenantId", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const slug = String(req.body?.slug || "").trim().toLowerCase();
    const productKey = String(req.body?.productKey || "mesamanda").trim().toLowerCase();
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador do tenant são obrigatórios." });
    const result = await pool.query("UPDATE nexus_tenants SET name = $1, slug = $2, product_key = $3, updated_at = NOW() WHERE id = $4 RETURNING id, name, slug, product_key, status, billing_status, due_date, grace_period_until, created_at", [name, slug, productKey, req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado." });
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "tenant.updated", "tenant", result.rows[0].id, JSON.stringify({ name, slug, productKey })]);
    return res.json({ tenant: withAccess(result.rows[0]) });
  } catch (error) { return next(error); }
});

router.patch("/:tenantId/status", async (req, res, next) => {
  try {
    const status = req.body?.active ? "active" : "suspended";
    const result = await pool.query("UPDATE nexus_tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, slug, product_key, status, billing_status, due_date, grace_period_until, created_at", [status, req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado." });
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, status === "active" ? "tenant.activated" : "tenant.suspended", "tenant", result.rows[0].id, JSON.stringify({ status })]);
    return res.json({ tenant: withAccess(result.rows[0]) });
  } catch (error) { return next(error); }
});

router.patch("/:tenantId/billing", async (req, res, next) => {
  try {
    const dueDate = req.body?.dueDate ? String(req.body.dueDate) : null;
    const gracePeriodUntil = req.body?.gracePeriodUntil ? String(req.body.gracePeriodUntil) : null;
    const billingStatus = String(req.body?.billingStatus || "current");
    if (!["current", "past_due", "paid", "cancelled"].includes(billingStatus)) return res.status(400).json({ error: "Status financeiro inválido." });
    const result = await pool.query("UPDATE nexus_tenants SET due_date = $1, grace_period_until = $2, billing_status = $3, updated_at = NOW() WHERE id = $4 RETURNING id, name, slug, product_key, status, billing_status, due_date, grace_period_until, created_at", [dueDate, gracePeriodUntil, billingStatus, req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado." });
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "tenant.billing_updated", "tenant", result.rows[0].id, JSON.stringify({ dueDate, gracePeriodUntil, billingStatus })]);
    return res.json({ tenant: withAccess(result.rows[0]) });
  } catch (error) { return next(error); }
});

router.get("/:tenantId/access", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT id, name, status, billing_status, due_date, grace_period_until FROM nexus_tenants WHERE id = $1", [req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado." });
    const tenant = withAccess(result.rows[0]);
    return res.json({ tenantId: tenant.id, accessLevel: tenant.access_level, billingStatus: tenant.billing_status, dueDate: tenant.due_date, gracePeriodUntil: tenant.grace_period_until });
  } catch (error) { return next(error); }
});

router.delete("/:tenantId", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM nexus_tenants WHERE id = $1 RETURNING id, name", [req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado." });
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "tenant.deleted", "tenant", result.rows[0].id, JSON.stringify({ name: result.rows[0].name })]);
    return res.status(204).send();
  } catch (error) { return next(error); }
});

export default router;
