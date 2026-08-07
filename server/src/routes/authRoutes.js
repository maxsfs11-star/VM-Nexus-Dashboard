import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const result = await pool.query("SELECT id, email, name, password_hash, active, role FROM nexus_admin_users WHERE email = $1", [email]);
    const admin = result.rows[0];
    if (!admin || !admin.active || !(await bcrypt.compare(password, admin.password_hash))) return res.status(401).json({ error: "Credenciais VM Nexus inválidas." });
    const token = jwt.sign({ sub: admin.id, email: admin.email, role: "nexus_admin", adminRole: admin.role }, env.jwtSecret, { expiresIn: "8h" });
    return res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  } catch (error) { return next(error); }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT id, email, name, active, role FROM nexus_admin_users WHERE id = $1", [req.admin.sub]);
    if (!result.rows[0]?.active) return res.status(401).json({ error: "Administrador desativado." });
    return res.json({ admin: result.rows[0] });
  } catch (error) { return next(error); }
});

export default router;
