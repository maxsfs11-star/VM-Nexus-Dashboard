import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

// Exclusão controlada para limpar contas usadas apenas nos testes do Stripe.
// Esta operação fica bloqueada fora de PAYMENTS_MODE=test.
router.delete("/billing/test-account", async (req, res, next) => {
  if (process.env.PAYMENTS_MODE !== "test") {
    return res.status(403).json({ error: "A limpeza de conta de teste está bloqueada fora do ambiente de testes." });
  }
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Informe o e-mail da conta de teste." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const studentResult = await client.query(
      "SELECT id, email FROM studycode_users WHERE LOWER(email) = $1 FOR UPDATE",
      [email],
    );
    const student = studentResult.rows[0];
    if (!student) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Conta StudyCode não encontrada." });
    }

    await client.query("UPDATE studycode_users SET plan_id = NULL, updated_at = NOW() WHERE id = $1", [student.id]);
    const transactions = await client.query(
      "DELETE FROM studycode_billing_transactions WHERE studycode_user_id = $1 RETURNING id",
      [student.id],
    );
    const payments = await client.query(
      "DELETE FROM studycode_billing_payments WHERE studycode_user_id = $1 RETURNING id",
      [student.id],
    );
    await client.query("COMMIT");
    return res.json({
      ok: true,
      email: student.email,
      deletedTransactions: transactions.rowCount,
      deletedPayments: payments.rowCount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.get("/billing", async (_req, res, next) => {
  try {
    const [plans, payments] = await Promise.all([
      pool.query(`
        SELECT plan.id, plan.name, plan.slug, plan.description, plan.monthly_price,
          plan.features, plan.display_order, plan.active,
          COUNT(DISTINCT student.id) FILTER (WHERE student.active = TRUE)::int AS subscribers
        FROM nexus_plans plan
        JOIN nexus_products product ON product.id = plan.product_id
        LEFT JOIN studycode_users student ON student.plan_id = plan.id
        WHERE product.slug = 'studycode'
        GROUP BY plan.id
        ORDER BY plan.display_order, plan.monthly_price, plan.name`),
      pool.query(`
        SELECT txn.id, txn.amount, txn.currency,
          txn.status, txn.provider, txn.payment_method,
          txn.checkout_session_id, txn.payment_intent_id,
          payment.subscription_id, payment.started_at, payment.next_billing_at,
          payment.cancelled_at, txn.created_at, txn.updated_at,
          student.name AS student_name, student.email AS student_email,
          plan.name AS plan_name, plan.slug AS plan_slug, plan.features AS plan_features
        FROM studycode_billing_transactions txn
        LEFT JOIN studycode_billing_payments payment ON payment.id = txn.billing_payment_id
        LEFT JOIN studycode_users student ON student.id = txn.studycode_user_id
        LEFT JOIN nexus_plans plan ON plan.id = txn.plan_id
        UNION ALL
        SELECT payment.id, payment.amount, payment.currency, payment.status,
          payment.provider, payment.payment_method, payment.checkout_session_id,
          payment.payment_intent_id, payment.subscription_id, payment.started_at,
          payment.next_billing_at, payment.cancelled_at, payment.created_at,
          payment.updated_at, student.name AS student_name, student.email AS student_email,
          plan.name AS plan_name, plan.slug AS plan_slug, plan.features AS plan_features
        FROM studycode_billing_payments payment
        LEFT JOIN studycode_users student ON student.id = payment.studycode_user_id
        LEFT JOIN nexus_plans plan ON plan.id = payment.plan_id
        WHERE payment.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM studycode_billing_transactions txn
            WHERE txn.billing_payment_id = payment.id
          )
        ORDER BY created_at DESC
        LIMIT 250`),
    ]);
    return res.json({ plans: plans.rows, payments: payments.rows });
  } catch (error) { return next(error); }
});

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

router.get("/content/:trackId", async (req, res, next) => {
  try {
    const [track, modules, lessons, challenges] = await Promise.all([
      pool.query("SELECT id, name, slug, description, active FROM studycode_tracks WHERE id = $1", [req.params.trackId]),
      pool.query("SELECT id, track_id, name, description, display_order, active FROM studycode_modules WHERE track_id = $1 ORDER BY display_order, name", [req.params.trackId]),
      pool.query("SELECT lesson.id, lesson.module_id, lesson.name, lesson.content, lesson.display_order, lesson.active FROM studycode_lessons lesson JOIN studycode_modules module ON module.id = lesson.module_id WHERE module.track_id = $1 ORDER BY lesson.display_order, lesson.name", [req.params.trackId]),
      pool.query("SELECT challenge.id, challenge.lesson_id, challenge.name, challenge.statement, challenge.difficulty, challenge.active FROM studycode_challenges challenge JOIN studycode_lessons lesson ON lesson.id = challenge.lesson_id JOIN studycode_modules module ON module.id = lesson.module_id WHERE module.track_id = $1 ORDER BY challenge.name", [req.params.trackId]),
    ]);
    if (!track.rows[0]) return res.status(404).json({ error: "Trilha não encontrada." });
    return res.json({ track: track.rows[0], modules: modules.rows, lessons: lessons.rows, challenges: challenges.rows });
  } catch (error) { return next(error); }
});

function contentText(value, fallback = "") { return String(value ?? fallback).trim(); }
function contentSlug(value) { return contentText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70); }

router.post("/content/tracks", async (req, res, next) => {
  try {
    const name = contentText(req.body?.name); const description = contentText(req.body?.description) || null;
    if (!name) return res.status(400).json({ error: "Nome da trilha é obrigatório." });
    const slug = contentSlug(name) || `trilha-${Date.now()}`;
    const result = await pool.query("INSERT INTO studycode_tracks (name, slug, description) VALUES ($1, $2, $3) RETURNING id, name, slug, description, active", [name, slug, description]);
    return res.status(201).json({ track: result.rows[0] });
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

router.post("/content/modules", async (req, res, next) => {
  try {
    const trackId = contentText(req.body?.trackId); const name = contentText(req.body?.name); const description = contentText(req.body?.description) || null;
    if (!trackId || !name) return res.status(400).json({ error: "Trilha e nome do módulo são obrigatórios." });
    const result = await pool.query("INSERT INTO studycode_modules (track_id, name, description, display_order) VALUES ($1, $2, $3, COALESCE((SELECT MAX(display_order) + 1 FROM studycode_modules WHERE track_id = $1), 0)) RETURNING id, track_id, name, description, display_order, active", [trackId, name, description]);
    return res.status(201).json({ module: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/content/modules/:moduleId", async (req, res, next) => {
  try {
    const name = contentText(req.body?.name); const description = contentText(req.body?.description) || null; const active = typeof req.body?.active === "boolean" ? req.body.active : null;
    if (!name) return res.status(400).json({ error: "Nome do módulo é obrigatório." });
    const result = await pool.query("UPDATE studycode_modules SET name = $1, description = $2, active = COALESCE($3, active) WHERE id = $4 RETURNING id, track_id, name, description, display_order, active", [name, description, active, req.params.moduleId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Módulo não encontrado." });
    return res.json({ module: result.rows[0] });
  } catch (error) { return next(error); }
});

router.post("/content/lessons", async (req, res, next) => {
  try {
    const moduleId = contentText(req.body?.moduleId); const name = contentText(req.body?.name); const content = contentText(req.body?.content) || null;
    if (!moduleId || !name) return res.status(400).json({ error: "Módulo e nome da aula são obrigatórios." });
    const result = await pool.query("INSERT INTO studycode_lessons (module_id, name, content, display_order) VALUES ($1, $2, $3, COALESCE((SELECT MAX(display_order) + 1 FROM studycode_lessons WHERE module_id = $1), 0)) RETURNING id, module_id, name, content, display_order, active", [moduleId, name, content]);
    return res.status(201).json({ lesson: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/content/lessons/:lessonId", async (req, res, next) => {
  try {
    const name = contentText(req.body?.name); const content = contentText(req.body?.content) || null; const active = typeof req.body?.active === "boolean" ? req.body.active : null;
    if (!name) return res.status(400).json({ error: "Nome da aula é obrigatório." });
    const result = await pool.query("UPDATE studycode_lessons SET name = $1, content = $2, active = COALESCE($3, active) WHERE id = $4 RETURNING id, module_id, name, content, display_order, active", [name, content, active, req.params.lessonId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Aula não encontrada." });
    return res.json({ lesson: result.rows[0] });
  } catch (error) { return next(error); }
});

router.post("/content/challenges", async (req, res, next) => {
  try {
    const lessonId = contentText(req.body?.lessonId); const name = contentText(req.body?.name); const statement = contentText(req.body?.statement) || null; const difficulty = ["beginner", "intermediate", "advanced"].includes(req.body?.difficulty) ? req.body.difficulty : "beginner";
    if (!lessonId || !name) return res.status(400).json({ error: "Aula e nome do desafio são obrigatórios." });
    const result = await pool.query("INSERT INTO studycode_challenges (lesson_id, name, statement, difficulty) VALUES ($1, $2, $3, $4) RETURNING id, lesson_id, name, statement, difficulty, active", [lessonId, name, statement, difficulty]);
    return res.status(201).json({ challenge: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/content/challenges/:challengeId", async (req, res, next) => {
  try {
    const name = contentText(req.body?.name); const statement = contentText(req.body?.statement) || null; const difficulty = ["beginner", "intermediate", "advanced"].includes(req.body?.difficulty) ? req.body.difficulty : "beginner"; const active = typeof req.body?.active === "boolean" ? req.body.active : null;
    if (!name) return res.status(400).json({ error: "Nome do desafio é obrigatório." });
    const result = await pool.query("UPDATE studycode_challenges SET name = $1, statement = $2, difficulty = $3, active = COALESCE($4, active) WHERE id = $5 RETURNING id, lesson_id, name, statement, difficulty, active", [name, statement, difficulty, active, req.params.challengeId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Desafio não encontrado." });
    return res.json({ challenge: result.rows[0] });
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

router.patch("/ai/plans/:planId/limit", async (req, res, next) => {
  try {
    const dailyLimit = Number(req.body?.dailyLimit);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 100000) return res.status(400).json({ error: "O limite deve ser um número inteiro entre 0 e 100.000." });
    const result = await pool.query("UPDATE nexus_plans SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{aiQuestionsPerDay}', to_jsonb($1::int), true) WHERE id = $2 RETURNING id, name, features", [dailyLimit, req.params.planId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Plano não encontrado." });
    return res.json({ plan: result.rows[0], dailyLimit });
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

router.get("/community/posts/:postId", async (req, res, next) => {
  try {
    const [post, comments] = await Promise.all([
      pool.query("SELECT post.id, post.title, post.body, post.category, post.status, post.pinned, post.created_at, student.name AS student_name, student.email AS student_email FROM studycode_community_posts post LEFT JOIN studycode_users student ON student.id = post.user_id WHERE post.id = $1", [req.params.postId]),
      pool.query("SELECT comment.id, comment.body, comment.status, comment.created_at, student.name AS student_name, student.email AS student_email FROM studycode_community_comments comment LEFT JOIN studycode_users student ON student.id = comment.user_id WHERE comment.post_id = $1 ORDER BY comment.created_at ASC", [req.params.postId]),
    ]);
    if (!post.rows[0]) return res.status(404).json({ error: "Publicação não encontrada." });
    return res.json({ post: post.rows[0], comments: comments.rows });
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

router.patch("/community/comments/:commentId", async (req, res, next) => {
  try {
    const status = ["published", "hidden"].includes(req.body?.status) ? req.body.status : undefined;
    const result = await pool.query("UPDATE studycode_community_comments SET status = COALESCE($1, status) WHERE id = $2 RETURNING id, status", [status, req.params.commentId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Comentário não encontrado." });
    return res.json({ comment: result.rows[0] });
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

router.get("/coins/packs", async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT pack.id, pack.slug, pack.name, pack.coin_amount, pack.price,
        pack.currency, pack.stripe_price_id, pack.active, pack.display_order
      FROM studycode_coin_packs pack
      JOIN nexus_products product ON product.id = pack.product_id
      WHERE product.slug = 'studycode'
      ORDER BY pack.display_order, pack.coin_amount`);
    return res.json({ packs: result.rows });
  } catch (error) { return next(error); }
});

router.post("/coins/packs", async (req, res, next) => {
  try {
    const slug = String(req.body?.slug || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const coinAmount = Number(req.body?.coinAmount);
    const price = Number(req.body?.price);
    if (!/^[a-z0-9-]+$/.test(slug) || !name || !Number.isInteger(coinAmount) || coinAmount <= 0 || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Informe identificador, nome, quantidade de CodeCoins e preço válidos." });
    }
    const result = await pool.query(`
      INSERT INTO studycode_coin_packs (product_id, slug, name, coin_amount, price, currency, stripe_price_id, display_order)
      SELECT product.id, $1, $2, $3, $4, COALESCE($5, 'BRL'), $6, COALESCE($7, 0)
      FROM nexus_products product
      WHERE product.slug = 'studycode'
      RETURNING id, slug, name, coin_amount, price, currency, stripe_price_id, active, display_order`,
    [slug, name, coinAmount, price, req.body?.currency, req.body?.stripePriceId || null, Number(req.body?.displayOrder || 0)]);
    if (!result.rows[0]) return res.status(404).json({ error: "Produto CodeCoin não encontrado." });
    return res.status(201).json({ pack: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/coins/packs/:packId", async (req, res, next) => {
  try {
    const result = await pool.query(`
      UPDATE studycode_coin_packs
      SET name = COALESCE($1, name),
        coin_amount = COALESCE($2, coin_amount),
        price = COALESCE($3, price),
        currency = COALESCE($4, currency),
        stripe_price_id = COALESCE($5, stripe_price_id),
        active = COALESCE($6, active),
        display_order = COALESCE($7, display_order),
        updated_at = NOW()
      WHERE id = $8
      RETURNING id, slug, name, coin_amount, price, currency, stripe_price_id, active, display_order`,
    [req.body?.name || null, Number.isInteger(Number(req.body?.coinAmount)) ? Number(req.body.coinAmount) : null, Number.isFinite(Number(req.body?.price)) ? Number(req.body.price) : null, req.body?.currency || null, req.body?.stripePriceId || null, typeof req.body?.active === "boolean" ? req.body.active : null, Number.isInteger(Number(req.body?.displayOrder)) ? Number(req.body.displayOrder) : null, req.params.packId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Pacote CodeCoin não encontrado." });
    return res.json({ pack: result.rows[0] });
  } catch (error) { return next(error); }
});

export default router;
