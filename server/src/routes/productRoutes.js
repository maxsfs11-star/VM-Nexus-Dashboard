import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

async function audit(req, action, entityId, metadata = {}) {
  await pool.query(
    "INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, 'product', $3, $4)",
    [req.admin.sub, action, entityId, JSON.stringify(metadata)],
  );
}

router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT product.id, product.name, product.slug, product.description, product.status,
        product.created_at, COUNT(DISTINCT plan.id)::int AS plan_count,
        COUNT(DISTINCT tenant.id)::int AS tenant_count
      FROM nexus_products product
      LEFT JOIN nexus_plans plan ON plan.product_id = product.id
      LEFT JOIN nexus_tenants tenant ON tenant.product_key = product.slug
      GROUP BY product.id
      ORDER BY product.created_at DESC, product.name
    `);
    return res.json({ products: result.rows });
  } catch (error) { return next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const slug = String(req.body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const description = String(req.body?.description || "").trim() || null;
    const status = ["development", "available", "planned", "archived"].includes(req.body?.status) ? req.body.status : "development";
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador do produto são obrigatórios." });
    const result = await pool.query(
      "INSERT INTO nexus_products (name, slug, description, status) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, slug, description, status],
    );
    await audit(req, "product.created", result.rows[0].id, { name, slug });
    return res.status(201).json({ product: result.rows[0] });
  } catch (error) { return next(error); }
});

router.put("/:productId", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim() || null;
    const status = ["development", "available", "planned", "archived"].includes(req.body?.status) ? req.body.status : "development";
    if (!name) return res.status(400).json({ error: "Nome do produto é obrigatório." });
    const result = await pool.query(
      "UPDATE nexus_products SET name = $1, description = $2, status = $3, updated_at = NOW() WHERE id = $4 RETURNING *",
      [name, description, status, req.params.productId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Produto não encontrado." });
    await audit(req, "product.updated", result.rows[0].id, { name, status });
    return res.json({ product: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/:productId/status", async (req, res, next) => {
  try {
    const status = ["development", "available", "planned", "archived"].includes(req.body?.status) ? req.body.status : "development";
    const result = await pool.query("UPDATE nexus_products SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *", [status, req.params.productId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Produto não encontrado." });
    await audit(req, "product.status_changed", result.rows[0].id, { status });
    return res.json({ product: result.rows[0] });
  } catch (error) { return next(error); }
});

export default router;
