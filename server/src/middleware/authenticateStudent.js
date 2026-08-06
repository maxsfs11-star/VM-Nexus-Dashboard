import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function authenticateStudent(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sessão do StudyCode necessária." });

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.role !== "studycode_student") throw new Error("invalid role");
    req.student = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Sessão do StudyCode inválida ou expirada." });
  }
}
