import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

function parseFeatures(value) {
  if (value && typeof value === "object") return value;
  if (!value) return {};
  try { return JSON.parse(value); } catch { return {}; }
}

async function audit(req, action, entityType, entityId, metadata = {}) {
  await pool.query(
    "INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)",
    [req.admin.sub, action, entityType, entityId, JSON.stringify(metadata)],
  );
}

router.get("/", async (req, res, next) => {
  try {
    const productKey = String(req.query.productKey || "mesamanda").trim().toLowerCase();
    const result = await pool.query(`
      SELECT p.id, p.name, p.slug, p.description, p.monthly_price, p.features, p.display_order, p.active,
        COUNT(s.id)::int AS subscribers
      FROM nexus_plans p
      JOIN nexus_products product ON product.id = p.product_id
      LEFT JOIN nexus_subscriptions s ON s.plan_id = p.id AND s.status IN ('trial', 'active')
      WHERE product.slug = $1
      GROUP BY p.id
      ORDER BY p.display_order, p.monthly_price, p.name
    `, [productKey]);
    return res.json({ plans: result.rows });
  } catch (error) { return next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const productKey = String(req.body?.productKey || "mesamanda").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const slug = String(req.body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const description = String(req.body?.description || "").trim() || null;
    const monthlyPrice = Number(req.body?.monthlyPrice ?? 0);
    const displayOrder = Number(req.body?.displayOrder ?? 0);
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador do plano sÃ£o obrigatÃ³rios." });
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) return res.status(400).json({ error: "Valor mensal invÃ¡lido." });
    const product = await pool.query("SELECT id FROM nexus_products WHERE slug = $1", [productKey]);
    if (!product.rows[0]) return res.status(404).json({ error: "Produto nÃ£o encontrado." });
    const result = await pool.query(
      "INSERT INTO nexus_plans (product_id, name, slug, description, monthly_price, features, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [product.rows[0].id, name, slug, description, monthlyPrice, parseFeatures(req.body?.features), displayOrder],
    );
    await audit(req, "plan.created", "plan", result.rows[0].id, { productKey, name, slug });
    return res.status(201).json({ plan: result.rows[0] });
  } catch (error) { return next(error); }
});

router.put("/:planId", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim() || null;
    const monthlyPrice = Number(req.body?.monthlyPrice ?? 0);
    const displayOrder = Number(req.body?.displayOrder ?? 0);
    if (!name || !Number.isFinite(monthlyPrice) || monthlyPrice < 0) return res.status(400).json({ error: "Nome ou valor mensal invÃ¡lido." });
    const result = await pool.query(
      "UPDATE nexus_plans SET name = $1, description = $2, monthly_price = $3, features = $4, display_order = $5 WHERE id = $6 RETURNING *",
      [name, description, monthlyPrice, parseFeatures(req.body?.features), displayOrder, req.params.planId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Plano nÃ£o encontrado." });
    await audit(req, "plan.updated", "plan", result.rows[0].id, { name, monthlyPrice });
    return res.json({ plan: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/:planId/status", async (req, res, next) => {
  try {
    const result = await pool.query("UPDATE nexus_plans SET active = $1 WHERE id = $2 RETURNING *", [Boolean(req.body?.active), req.params.planId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Plano nÃ£o encontrado." });
    await audit(req, result.rows[0].active ? "plan.activated" : "plan.deactivated", "plan", result.rows[0].id);
    return res.json({ plan: result.rows[0] });
  } catch (error) { return next(error); }
});

router.delete("/:planId", async (req, res, next) => {
  try {
    const plan = await pool.query("SELECT id, name FROM nexus_plans WHERE id = $1", [req.params.planId]);
    if (!plan.rows[0]) return res.status(404).json({ error: "Plano não encontrado." });

    const subscriptions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM nexus_subscriptions WHERE plan_id = $1",
      [req.params.planId],
    );
    if (subscriptions.rows[0].count > 0) {
      return res.status(409).json({
        error: "Este plano possui histórico de assinaturas e não pode ser excluído. Pause-o para removê-lo do aplicativo.",
      });
    }

    await pool.query("DELETE FROM nexus_plans WHERE id = $1", [req.params.planId]);
    await audit(req, "plan.deleted", "plan", plan.rows[0].id, { name: plan.rows[0].name });
    return res.json({ deleted: true, planId: plan.rows[0].id });
  } catch (error) { return next(error); }
});

export default router;
