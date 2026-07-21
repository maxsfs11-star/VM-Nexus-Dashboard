import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";

if (!env.adminEmail || !env.adminPassword) throw new Error("Defina NEXUS_ADMIN_EMAIL e NEXUS_ADMIN_PASSWORD no .env antes de criar o administrador.");
if (env.adminPassword.length < 8) throw new Error("A senha do administrador deve ter pelo menos 8 caracteres.");
const hash = await bcrypt.hash(env.adminPassword, 12);
await pool.query(`INSERT INTO nexus_admin_users (email, name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, active = TRUE, updated_at = NOW()`, [env.adminEmail.toLowerCase(), "Administrador VM Nexus", hash]);
console.log(`Administrador VM Nexus preparado: ${env.adminEmail.toLowerCase()}`);
await pool.end();

