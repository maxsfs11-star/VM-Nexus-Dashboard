import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticateStudent } from "../middleware/authenticateStudent.js";

const router = Router();
const ACCESS_EXPIRES_IN = "30m";
const REFRESH_DAYS = 30;

function safeStudent(student) {
  return { id: student.id, email: student.email, name: student.name };
}

function issueAccessToken(student) {
  return jwt.sign(
    { sub: student.id, email: student.email, role: "studycode_student" },
    env.jwtSecret,
    { expiresIn: ACCESS_EXPIRES_IN },
  );
}

async function issueRefreshToken(studentId) {
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO studycode_refresh_tokens (user_id, token_id, expires_at) VALUES ($1, $2, $3)",
    [studentId, tokenId, expiresAt],
  );
  return jwt.sign(
    { sub: studentId, tokenId, role: "studycode_refresh" },
    env.jwtSecret,
    { expiresIn: `${REFRESH_DAYS}d` },
  );
}

function validateCredentials(email, password) {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return "Informe um e-mail válido.";
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  return null;
}

router.post("/register", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "Estudante").trim().slice(0, 80) || "Estudante";
    const acceptedTerms = req.body?.acceptedTerms === true;
    const legalVersion = String(req.body?.legalVersion || "").trim();
    const validationError = validateCredentials(email, password);
    if (validationError) return res.status(400).json({ error: validationError });
    if (!acceptedTerms || !legalVersion) {
      return res.status(400).json({ error: "Aceite os Termos de Uso e a Política de Privacidade." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO studycode_users
        (email, name, password_hash, terms_accepted_at, privacy_accepted_at, legal_version)
       VALUES ($1, $2, $3, NOW(), NOW(), $4)
       RETURNING id, email, name`,
      [email, name, passwordHash, legalVersion],
    );
    const student = result.rows[0];
    const refreshToken = await issueRefreshToken(student.id);
    return res.status(201).json({
      student: safeStudent(student),
      accessToken: issueAccessToken(student),
      refreshToken,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const result = await pool.query(
      "SELECT id, email, name, password_hash, active FROM studycode_users WHERE email = $1",
      [email],
    );
    const student = result.rows[0];
    if (!student || !student.active || !(await bcrypt.compare(password, student.password_hash))) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }
    const refreshToken = await issueRefreshToken(student.id);
    return res.json({
      student: safeStudent(student),
      accessToken: issueAccessToken(student),
      refreshToken,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "");
    const payload = jwt.verify(refreshToken, env.jwtSecret);
    if (payload.role !== "studycode_refresh") throw new Error("invalid role");
    const result = await pool.query(
      `SELECT u.id, u.email, u.name
       FROM studycode_refresh_tokens token
       JOIN studycode_users u ON u.id = token.user_id
       WHERE token.token_id = $1 AND token.user_id = $2
         AND token.revoked_at IS NULL AND token.expires_at > NOW() AND u.active = TRUE`,
      [payload.tokenId, payload.sub],
    );
    if (!result.rows[0]) return res.status(401).json({ error: "Refresh token inválido ou expirado." });
    await pool.query("UPDATE studycode_refresh_tokens SET revoked_at = NOW() WHERE token_id = $1", [payload.tokenId]);
    const student = result.rows[0];
    return res.json({
      student: safeStudent(student),
      accessToken: issueAccessToken(student),
      refreshToken: await issueRefreshToken(student.id),
    });
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Refresh token inválido ou expirado." });
    }
    return next(error);
  }
});

router.get("/me", authenticateStudent, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, email, name, active, created_at FROM studycode_users WHERE id = $1",
      [req.student.sub],
    );
    if (!result.rows[0]?.active) return res.status(401).json({ error: "Conta StudyCode desativada." });
    return res.json({ student: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

export default router;
