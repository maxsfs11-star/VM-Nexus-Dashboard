import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router({ mergeParams: true });
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT id, tenant_id, name, slug, city, state, active, created_at FROM nexus_units WHERE tenant_id = $1 ORDER BY created_at", [req.params.tenantId]);
    return res.json({ units: result.rows });
  } catch (error) { return next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const slug = String(req.body?.slug || "").trim().toLowerCase();
    const city = String(req.body?.city || "").trim() || null;
    const state = String(req.body?.state || "").trim().toUpperCase() || null;
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador da unidade são obrigatórios." });
    const result = await pool.query("INSERT INTO nexus_units (tenant_id, name, slug, city, state) VALUES ($1, $2, $3, $4, $5) RETURNING id, tenant_id, name, slug, city, state, active, created_at", [req.params.tenantId, name, slug, city, state]);
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "unit.created", "unit", result.rows[0].id, JSON.stringify({ tenantId: req.params.tenantId, name, slug })]);
    return res.status(201).json({ unit: result.rows[0] });
  } catch (error) { return next(error); }
});

router.put("/:unitId", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const slug = String(req.body?.slug || "").trim().toLowerCase();
    const city = String(req.body?.city || "").trim() || null;
    const state = String(req.body?.state || "").trim().toUpperCase() || null;
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador da unidade são obrigatórios." });
    const result = await pool.query("UPDATE nexus_units SET name = $1, slug = $2, city = $3, state = $4 WHERE id = $5 AND tenant_id = $6 RETURNING id, tenant_id, name, slug, city, state, active, created_at", [name, slug, city, state, req.params.unitId, req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Unidade não encontrada neste tenant." });
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "unit.updated", "unit", result.rows[0].id, JSON.stringify({ tenantId: req.params.tenantId, name, slug })]);
    return res.json({ unit: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/:unitId/status", async (req, res, next) => {
  try {
    const active = Boolean(req.body?.active);
    const result = await pool.query("UPDATE nexus_units SET active = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, tenant_id, name, slug, city, state, active, created_at", [active, req.params.unitId, req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Unidade não encontrada neste tenant." });
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, active ? "unit.activated" : "unit.deactivated", "unit", result.rows[0].id, JSON.stringify({ tenantId: req.params.tenantId })]);
    return res.json({ unit: result.rows[0] });
  } catch (error) { return next(error); }
});

router.delete("/:unitId", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM nexus_units WHERE id = $1 AND tenant_id = $2 RETURNING id, name", [req.params.unitId, req.params.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Unidade não encontrada neste tenant." });
    await pool.query("INSERT INTO nexus_audit_logs (admin_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)", [req.admin.sub, "unit.deleted", "unit", result.rows[0].id, JSON.stringify({ tenantId: req.params.tenantId, name: result.rows[0].name })]);
    return res.status(204).send();
  } catch (error) { return next(error); }
});

export default router;
