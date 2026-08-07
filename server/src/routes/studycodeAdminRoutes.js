import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

router.get("/students", async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.birth_date, u.city, u.country, u.active,
        u.xp, u.streak_days, u.last_active_at, u.created_at,
        plan.name AS plan_name, track.name AS current_track,
        COALESCE(progress.completed_lessons, 0)::int AS completed_lessons,
        COALESCE(ai.questions, 0)::int AS ai_questions
      FROM studycode_users u
      LEFT JOIN nexus_plans plan ON plan.id = u.plan_id
      LEFT JOIN studycode_tracks track ON track.id = u.current_track_id
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed_lessons FROM studycode_lesson_progress WHERE user_id = u.id) progress ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) AS questions FROM studycode_ai_questions WHERE user_id = u.id) ai ON TRUE
      ORDER BY u.created_at DESC`);
    return res.json({ students: result.rows });
  } catch (error) { return next(error); }
});

router.get("/students/:studentId", async (req, res, next) => {
  try {
    const student = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.birth_date, u.city, u.country, u.active,
        u.xp, u.streak_days, u.last_active_at, u.created_at, plan.name AS plan_name, track.name AS current_track
      FROM studycode_users u
      LEFT JOIN nexus_plans plan ON plan.id = u.plan_id
      LEFT JOIN studycode_tracks track ON track.id = u.current_track_id
      WHERE u.id = $1`, [req.params.studentId]);
    if (!student.rows[0]) return res.status(404).json({ error: "Aluno não encontrado." });
    const [progress, ai, coins, certificates] = await Promise.all([
      pool.query(`SELECT lesson.name, module.name AS module_name, track.name AS track_name, progress.completed_at, progress.xp_earned FROM studycode_lesson_progress progress JOIN studycode_lessons lesson ON lesson.id = progress.lesson_id JOIN studycode_modules module ON module.id = lesson.module_id JOIN studycode_tracks track ON track.id = module.track_id WHERE progress.user_id = $1 ORDER BY progress.updated_at DESC`, [req.params.studentId]),
      pool.query("SELECT id, provider, model, question, answer, tokens_used, created_at FROM studycode_ai_questions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [req.params.studentId]),
      pool.query("SELECT id, amount, reason, created_at FROM studycode_coin_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [req.params.studentId]),
      pool.query("SELECT certificate_code, title, issued_at, status FROM studycode_certificates WHERE user_id = $1 ORDER BY issued_at DESC", [req.params.studentId]),
    ]);
    return res.json({ student: student.rows[0], progress: progress.rows, aiHistory: ai.rows, coins: coins.rows, certificates: certificates.rows });
  } catch (error) { return next(error); }
});

router.get("/content", async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT track.id, track.name, track.slug, track.description, track.active, COUNT(DISTINCT module.id)::int AS modules, COUNT(DISTINCT lesson.id)::int AS lessons, COUNT(DISTINCT challenge.id)::int AS challenges FROM studycode_tracks track LEFT JOIN studycode_modules module ON module.track_id = track.id LEFT JOIN studycode_lessons lesson ON lesson.module_id = module.id LEFT JOIN studycode_challenges challenge ON challenge.lesson_id = lesson.id GROUP BY track.id ORDER BY track.name`);
    return res.json({ tracks: result.rows });
  } catch (error) { return next(error); }
});

router.patch("/content/tracks/:trackId", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim(); const description = String(req.body?.description || "").trim() || null;
    if (!name) return res.status(400).json({ error: "Nome da trilha é obrigatório." });
    const result = await pool.query("UPDATE studycode_tracks SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING id, name, slug, description, active", [name, description, req.params.trackId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Trilha não encontrada." });
    return res.json({ track: result.rows[0] });
  } catch (error) { return next(error); }
});

router.get("/ai", async (_req, res, next) => {
  try {
    const [limits, history] = await Promise.all([
      pool.query(`SELECT plan.id, plan.name, plan.description, plan.monthly_price, plan.features, CASE WHEN COALESCE(plan.features->>'aiQuestionsPerDay', '') ~ '^[0-9]+$' THEN (plan.features->>'aiQuestionsPerDay')::int ELSE 0 END AS daily_limit FROM nexus_plans plan JOIN nexus_products product ON product.id = plan.product_id WHERE product.slug = 'studycode' ORDER BY plan.display_order, plan.name`),
      pool.query(`SELECT ai.id, ai.provider, ai.model, ai.question, ai.tokens_used, ai.created_at, student.name AS student_name, student.email AS student_email FROM studycode_ai_questions ai LEFT JOIN studycode_users student ON student.id = ai.user_id ORDER BY ai.created_at DESC LIMIT 100`),
    ]);
    return res.json({ limits: limits.rows, history: history.rows });
  } catch (error) { return next(error); }
});

router.get("/analytics", async (_req, res, next) => {
  try {
    const [summary, activity] = await Promise.all([
      pool.query(`SELECT (SELECT COUNT(*)::int FROM studycode_users) AS total_users, (SELECT COUNT(*)::int FROM studycode_users WHERE active = TRUE) AS active_users, (SELECT COUNT(*)::int FROM studycode_users WHERE last_active_at >= NOW() - INTERVAL '30 days') AS active_last_30_days, (SELECT COUNT(*)::int FROM studycode_lesson_progress WHERE completed_at IS NOT NULL) AS completed_lessons, (SELECT COALESCE(SUM(xp), 0)::int FROM studycode_users) AS total_xp, (SELECT COUNT(*)::int FROM studycode_ai_questions) AS total_ai_questions`),
      pool.query(`SELECT DATE(COALESCE(last_active_at, created_at)) AS day, COUNT(*)::int AS users FROM studycode_users WHERE COALESCE(last_active_at, created_at) >= CURRENT_DATE - INTERVAL '30 days' GROUP BY day ORDER BY day`),
    ]);
    return res.json({ summary: summary.rows[0], activity: activity.rows });
  } catch (error) { return next(error); }
});

router.get("/community", async (_req, res, next) => {
  try {
    const [posts, feedback] = await Promise.all([
      pool.query(`SELECT post.id, post.title, post.body, post.category, post.status, post.pinned, post.created_at, student.name AS student_name, student.email AS student_email, COUNT(comment.id)::int AS comments FROM studycode_community_posts post LEFT JOIN studycode_users student ON student.id = post.user_id LEFT JOIN studycode_community_comments comment ON comment.post_id = post.id AND comment.status = 'published' GROUP BY post.id, student.name, student.email ORDER BY post.pinned DESC, post.created_at DESC LIMIT 100`),
      pool.query(`SELECT feedback.id, feedback.type, feedback.subject, feedback.body, feedback.status, feedback.created_at, student.name AS student_name, student.email AS student_email FROM studycode_feedback feedback LEFT JOIN studycode_users student ON student.id = feedback.user_id ORDER BY feedback.created_at DESC LIMIT 100`),
    ]);
    return res.json({ posts: posts.rows, feedback: feedback.rows });
  } catch (error) { return next(error); }
});

router.patch("/community/posts/:postId", async (req, res, next) => {
  try {
    const status = ["published", "hidden", "archived"].includes(req.body?.status) ? req.body.status : undefined;
    const result = await pool.query("UPDATE studycode_community_posts SET status = COALESCE($1, status), pinned = COALESCE($2, pinned), updated_at = NOW() WHERE id = $3 RETURNING id, status, pinned", [status, typeof req.body?.pinned === "boolean" ? req.body.pinned : null, req.params.postId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Publicação não encontrada." });
    return res.json({ post: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/community/feedback/:feedbackId", async (req, res, next) => {
  try {
    const status = ["open", "in_progress", "resolved", "closed"].includes(req.body?.status) ? req.body.status : undefined;
    const result = await pool.query("UPDATE studycode_feedback SET status = COALESCE($1, status), updated_at = NOW() WHERE id = $2 RETURNING id, status", [status, req.params.feedbackId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Feedback não encontrado." });
    return res.json({ feedback: result.rows[0] });
  } catch (error) { return next(error); }
});

router.get("/economy", async (_req, res, next) => {
  try {
    const [coins, certificates] = await Promise.all([
      pool.query(`SELECT coin_tx.id, coin_tx.amount, coin_tx.reason, coin_tx.created_at, student.name AS student_name, student.email AS student_email FROM studycode_coin_transactions coin_tx JOIN studycode_users student ON student.id = coin_tx.user_id ORDER BY coin_tx.created_at DESC LIMIT 100`),
      pool.query(`SELECT certificate.id, certificate.certificate_code, certificate.title, certificate.issued_at, certificate.status, student.name AS student_name, student.email AS student_email, track.name AS track_name FROM studycode_certificates certificate JOIN studycode_users student ON student.id = certificate.user_id LEFT JOIN studycode_tracks track ON track.id = certificate.track_id ORDER BY certificate.issued_at DESC LIMIT 100`),
    ]);
    return res.json({ coins: coins.rows, certificates: certificates.rows });
  } catch (error) { return next(error); }
});

export default router;
