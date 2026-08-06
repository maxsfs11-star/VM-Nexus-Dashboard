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
  if (tenant.plan_status === "paused" || tenant.plan_status === "cancelled") return "blocked";
  if (tenant.status === "suspended" || tenant.status === "closed") return "blocked";
  if (tenant.billing_status === "cancelled") return "blocked";
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

async function productExists(productKey, includeArchived = false) {
  const result = await pool.query("SELECT 1 FROM nexus_products WHERE slug = $1 AND ($2 OR status <> 'archived')", [productKey, includeArchived]);
  return Boolean(result.rows[0]);
}

router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT t.id, t.name, t.slug, t.product_key, t.status, t.billing_status, t.due_date, t.grace_period_until, t.created_at, COUNT(u.id)::int AS units,
      plan.id AS plan_id, plan.name AS plan_name, plan.slug AS plan_slug, plan.monthly_price AS plan_monthly_price, plan.status AS plan_status
      FROM nexus_tenants t
      LEFT JOIN nexus_units u ON u.tenant_id = t.id
      LEFT JOIN LATERAL (SELECT p.id, p.name, p.slug, p.monthly_price, s.status FROM nexus_subscriptions s JOIN nexus_plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id ORDER BY s.started_at DESC LIMIT 1) plan ON TRUE
      GROUP BY t.id, plan.id, plan.name, plan.slug, plan.monthly_price, plan.status ORDER BY t.created_at DESC`);
    return res.json({ tenants: result.rows.map(withAccess) });
  } catch (error) { return next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const slug = String(req.body?.slug || "").trim().toLowerCase();
    const productKey = String(req.body?.productKey || "mesamanda").trim().toLowerCase();
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador do tenant são obrigatórios." });
    if (!(await productExists(productKey))) return res.status(400).json({ error: "Selecione um projeto ativo do catálogo." });
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
    if (!(await productExists(productKey, true))) return res.status(400).json({ error: "Selecione um projeto válido do catálogo." });
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
    const result = await pool.query(`SELECT t.id, t.name, t.status, t.billing_status, t.due_date, t.grace_period_until,
      plan.id AS plan_id, plan.name AS plan_name, plan.slug AS plan_slug, plan.status AS plan_status
      FROM nexus_tenants t
      LEFT JOIN LATERAL (SELECT p.id, p.name, p.slug, s.status FROM nexus_subscriptions s JOIN nexus_plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id ORDER BY s.started_at DESC LIMIT 1) plan ON TRUE
      WHERE t.id = $1`, [req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant não encontrado." });
    const tenant = withAccess(result.rows[0]);
    return res.json({ tenantId: tenant.id, accessLevel: tenant.access_level, billingStatus: tenant.billing_status, dueDate: tenant.due_date, gracePeriodUntil: tenant.grace_period_until, plan: tenant.plan_id ? { id: tenant.plan_id, name: tenant.plan_name, slug: tenant.plan_slug, status: tenant.plan_status } : null });
  } catch (error) { return next(error); }
});

router.get("/:tenantId/subscription", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT s.id, s.status, s.started_at, s.ends_at, p.id AS plan_id, p.name AS plan_name, p.slug AS plan_slug, p.monthly_price
      FROM nexus_subscriptions s JOIN nexus_plans p ON p.id = s.plan_id WHERE s.tenant_id = $1 ORDER BY s.started_at DESC LIMIT 1`, [req.params.tenantId]);
    return res.json({ subscription: result.rows[0] || null });
  } catch (error) { return next(error); }
});

router.put("/:tenantId/subscription", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const planId = String(req.body?.planId || "").trim();
    const status = String(req.body?.status || "active").trim();
    const endsAt = req.body?.endsAt ? String(req.body.endsAt) : null;
    if (!planId || !["trial", "active", "paused", "cancelled"].includes(status)) return res.status(400).json({ error: "Plano e status da assinatura sÃ£o obrigatÃ³rios." });
    await client.query("BEGIN");
    const tenant = await client.query("SELECT id, product_key FROM nexus_tenants WHERE id = $1 FOR UPDATE", [req.params.tenantId]);
    if (!tenant.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Tenant nÃ£o encontrado." }); }
    const plan = await client.query("SELECT p.id, p.name, product.slug AS product_key FROM nexus_plans p JOIN nexus_products product ON product.id = p.product_id WHERE p.id = $1", [planId]);
    if (!plan.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Plano nÃ£o encontrado." }); }
    if (plan.rows[0].product_key !== tenant.rows[0].product_key) { await client.query("ROLLBACK"); return res.status(409).json({ error: "O plano nÃ£o pertence ao produto deste tenant." }); }
    await client.query("UPDATE nexus_subscriptions SET status = 'cancelled', ends_at = COALESCE(ends_at, NOW()) WHERE tenant_id = $1 AND status IN ('trial', 'active')", [req.params.tenantId]);
    const subscription = await client.query("INSERT INTO nexus_subscriptions (tenant_id, plan_id, status, ends_at) VALUES ($1, $2, $3, $4) RETURNING id, status, started_at, ends_at", [req.params.tenantId, planId, status, endsAt]);
    await client.query("UPDATE nexus_tenants SET status = CASE WHEN $2 IN ('trial', 'active') THEN 'active' ELSE status END, updated_at = NOW() WHERE id = $1", [req.params.tenantId, status]);
    await client.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "tenant.subscription_updated", "tenant", req.params.tenantId, JSON.stringify({ planId, planName: plan.rows[0].name, status, endsAt })]);
    await client.query("COMMIT");
    return res.json({ subscription: { ...subscription.rows[0], planId, planName: plan.rows[0].name } });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
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
