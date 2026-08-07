import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
const PRODUCT_TYPES = new Set(["system", "mobile_app", "web_app", "service"]);
const PRODUCT_STATUSES = new Set(["development", "available", "planned", "archived"]);
const PLATFORMS = new Set(["web", "desktop", "android", "ios"]);
const TECHNOLOGIES = new Set(["react", "android_studio", "tauri", "other"]);

router.use(authenticate);

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizePlatforms(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter((item) => PLATFORMS.has(item)))];
}

function normalizeTechnology(value) {
  const technology = String(value || "other").trim().toLowerCase();
  return TECHNOLOGIES.has(technology) ? technology : "other";
}

async function audit(req, action, entityId, metadata = {}) {
  await pool.query(
    "INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, 'product', $3, $4)",
    [req.admin.sub, action, entityId, JSON.stringify(metadata)],
  );
}

router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.slug, p.description, p.category, p.product_type, p.platforms, p.technology, p.tenant_enabled, p.status,
        p.created_at, p.updated_at, COUNT(DISTINCT t.id)::int AS tenants, COUNT(DISTINCT plans.id)::int AS plans
      FROM nexus_products p
      LEFT JOIN nexus_tenants t ON t.product_key = p.slug
      LEFT JOIN nexus_plans plans ON plans.product_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC, p.name
    `);
    return res.json({ products: result.rows });
  } catch (error) { return next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const slug = normalizeSlug(req.body?.slug || name);
    const description = String(req.body?.description || "").trim() || null;
    const category = String(req.body?.category || "").trim() || null;
    const productType = String(req.body?.productType || "system").trim();
    const status = String(req.body?.status || "planned").trim();
    const platforms = normalizePlatforms(req.body?.platforms);
    const technology = normalizeTechnology(req.body?.technology);
    const tenantEnabled = technology === "tauri" && Boolean(req.body?.tenantEnabled);
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador do projeto são obrigatórios." });
    if (!PRODUCT_TYPES.has(productType) || !PRODUCT_STATUSES.has(status)) return res.status(400).json({ error: "Tipo ou status do projeto inválido." });
    if (!platforms.length) return res.status(400).json({ error: "Selecione pelo menos uma plataforma." });
    const result = await pool.query(
      `INSERT INTO nexus_products (name, slug, description, category, product_type, platforms, technology, tenant_enabled, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, slug, description, category, productType, platforms, technology, tenantEnabled, status],
    );
    await audit(req, "product.created", result.rows[0].id, { name, slug, productType, technology, tenantEnabled, platforms });
    return res.status(201).json({ product: result.rows[0] });
  } catch (error) { return next(error); }
});

router.put("/:productId", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim() || null;
    const category = String(req.body?.category || "").trim() || null;
    const productType = String(req.body?.productType || "system").trim();
    const status = String(req.body?.status || "planned").trim();
    const platforms = normalizePlatforms(req.body?.platforms);
    const technology = normalizeTechnology(req.body?.technology);
    const tenantEnabled = technology === "tauri" && Boolean(req.body?.tenantEnabled);
    if (!name) return res.status(400).json({ error: "Nome do projeto é obrigatório." });
    if (!PRODUCT_TYPES.has(productType) || !PRODUCT_STATUSES.has(status)) return res.status(400).json({ error: "Tipo ou status do projeto inválido." });
    if (!platforms.length) return res.status(400).json({ error: "Selecione pelo menos uma plataforma." });
    const result = await pool.query(
      `UPDATE nexus_products SET name = $1, description = $2, category = $3, product_type = $4,
       platforms = $5, technology = $6, tenant_enabled = $7, status = $8, updated_at = NOW() WHERE id = $9 RETURNING *`,
      [name, description, category, productType, platforms, technology, tenantEnabled, status, req.params.productId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Projeto não encontrado." });
    await audit(req, "product.updated", result.rows[0].id, { name, productType, technology, tenantEnabled, status, platforms });
    return res.json({ product: result.rows[0] });
  } catch (error) { return next(error); }
});

router.delete("/:productId", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const product = await client.query("SELECT id, name, slug FROM nexus_products WHERE id = $1 FOR UPDATE", [req.params.productId]);
    if (!product.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Projeto não encontrado." }); }
    const usage = await client.query(
      `SELECT (SELECT COUNT(*)::int FROM nexus_tenants WHERE product_key = $1) AS tenants,
        (SELECT COUNT(*)::int FROM nexus_plans WHERE product_id = $2) AS plans`,
      [product.rows[0].slug, req.params.productId],
    );
    if (usage.rows[0].tenants || usage.rows[0].plans) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Não é possível excluir um projeto vinculado a tenants ou planos. Arquive-o primeiro." });
    }
    await client.query("DELETE FROM nexus_products WHERE id = $1", [req.params.productId]);
    await client.query(
      "INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'product.deleted', 'product', $2, $3)",
      [req.admin.sub, req.params.productId, JSON.stringify({ name: product.rows[0].name, slug: product.rows[0].slug })],
    );
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally { client.release(); }
});

export default router;
