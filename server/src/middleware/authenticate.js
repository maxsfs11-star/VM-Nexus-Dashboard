import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Autenticação VM Nexus necessária." });
  try {
    req.admin = jwt.verify(token, env.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: "Sessão VM Nexus inválida ou expirada." });
  }
}

