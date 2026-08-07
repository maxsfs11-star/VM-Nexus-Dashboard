import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

function requireOwner(req, res, next) {
  if (req.admin.adminRole !== "owner") return res.status(403).json({ error: "Somente o proprietário pode alterar permissões." });
  return next();
}

router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT id, email, name, active, role, created_at FROM nexus_admin_users ORDER BY name, email");
    return res.json({ admins: result.rows });
  } catch (error) { return next(error); }
});

router.patch("/:adminId", requireOwner, async (req, res, next) => {
  try {
    const role = ["owner", "admin", "editor", "finance", "support"].includes(req.body?.role) ? req.body.role : undefined;
    const active = typeof req.body?.active === "boolean" ? req.body.active : undefined;
    if (!role && typeof active !== "boolean") return res.status(400).json({ error: "Informe uma permissão ou status válido." });
    if (req.params.adminId === req.admin.sub && active === false) return res.status(400).json({ error: "Você não pode desativar sua própria conta." });
    const result = await pool.query("UPDATE nexus_admin_users SET role = COALESCE($1, role), active = COALESCE($2, active), updated_at = NOW() WHERE id = $3 RETURNING id, email, name, active, role, created_at", [role, active, req.params.adminId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Administrador não encontrado." });
    return res.json({ admin: result.rows[0] });
  } catch (error) { return next(error); }
});

export default router;
