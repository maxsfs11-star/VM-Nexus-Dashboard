import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

function dateParam(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

router.get("/", async (req, res, next) => {
  try {
    const end = dateParam(req.query.to, new Date());
    const defaultStart = new Date(end);
    defaultStart.setDate(defaultStart.getDate() - 30);
    const start = dateParam(req.query.from, defaultStart);
    const [financial, subscriptions, education, alerts, activity] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(plan.monthly_price) FROM nexus_subscriptions subscription JOIN nexus_plans plan ON plan.id = subscription.plan_id WHERE subscription.status = 'active'), 0)::numeric AS mrr,
          COALESCE((SELECT SUM(plan.monthly_price) FROM nexus_subscriptions subscription JOIN nexus_plans plan ON plan.id = subscription.plan_id WHERE subscription.status = 'active' AND subscription.started_at >= $1 AND subscription.started_at < $2), 0)::numeric AS new_mrr,
          COALESCE((SELECT SUM(plan.monthly_price) FROM nexus_subscriptions subscription JOIN nexus_plans plan ON plan.id = subscription.plan_id WHERE subscription.status = 'cancelled' AND subscription.ends_at >= $1 AND subscription.ends_at < $2), 0)::numeric AS lost_mrr,
          (SELECT COUNT(*) FROM nexus_tenants WHERE billing_status = 'past_due')::int AS past_due_tenants,
          (SELECT COUNT(*) FROM nexus_products WHERE status <> 'archived')::int AS active_products`, [start, end]),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'trial')::int AS trials,
          COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
          COUNT(*) FILTER (WHERE status = 'cancelled' AND COALESCE(ends_at, started_at) >= $1 AND COALESCE(ends_at, started_at) < $2)::int AS cancelled_in_period
        FROM nexus_subscriptions`, [start, end]),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM studycode_users)::int AS total_students,
          (SELECT COUNT(*) FROM studycode_users WHERE active = TRUE)::int AS active_students,
          (SELECT COUNT(*) FROM studycode_users WHERE COALESCE(last_active_at, created_at) >= $1 AND COALESCE(last_active_at, created_at) < $2)::int AS students_in_period,
          (SELECT COUNT(*) FROM studycode_lesson_progress WHERE completed_at >= $1 AND completed_at < $2)::int AS completed_lessons,
          (SELECT COUNT(*) FROM studycode_ai_questions WHERE created_at >= $1 AND created_at < $2)::int AS ai_questions,
          (SELECT COALESCE(SUM(amount), 0) FROM studycode_coin_transactions WHERE created_at >= $1 AND created_at < $2)::int AS coins_moved`, [start, end]),
      pool.query(`
        SELECT 'billing' AS type, 'Pagamento pendente' AS title, CONCAT(tenant.name, ' está com cobrança em atraso.') AS detail, tenant.id, tenant.created_at AS created_at
        FROM nexus_tenants tenant WHERE tenant.billing_status = 'past_due'
        UNION ALL
        SELECT 'subscription', 'Renovação próxima', CONCAT(plan.name, ' de ', tenant.name, ' termina em até 7 dias.'), tenant.id, subscription.ends_at
        FROM nexus_subscriptions subscription JOIN nexus_tenants tenant ON tenant.id = subscription.tenant_id JOIN nexus_plans plan ON plan.id = subscription.plan_id
        WHERE subscription.status IN ('trial', 'active') AND subscription.ends_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        UNION ALL
        SELECT 'community', 'Feedback aguardando resposta', CONCAT(COUNT(*), ' reclamação(ões) ou sugestão(ões) em aberto.'), NULL, MAX(created_at)
        FROM studycode_feedback WHERE status IN ('open', 'in_progress')
        HAVING COUNT(*) > 0
        ORDER BY created_at DESC LIMIT 12`),
      pool.query(`SELECT action, entity_type, metadata, created_at FROM nexus_audit_logs WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 12`, [start, end]),
    ]);
    return res.json({ period: { from: start.toISOString(), to: end.toISOString() }, financial: financial.rows[0], subscriptions: subscriptions.rows[0], education: education.rows[0], alerts: alerts.rows, activity: activity.rows });
  } catch (error) { return next(error); }
});

router.get("/financial", async (_req, res, next) => {
  try {
    const [summary, monthly, products] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(plan.monthly_price) FILTER (WHERE subscription.status = 'active'), 0)::numeric AS mrr, COALESCE(AVG(plan.monthly_price) FILTER (WHERE subscription.status = 'active'), 0)::numeric AS average_ticket, COUNT(*) FILTER (WHERE subscription.status = 'active')::int AS active_subscriptions, (SELECT COUNT(*)::int FROM nexus_tenants WHERE billing_status = 'past_due') AS past_due_tenants FROM nexus_subscriptions subscription JOIN nexus_plans plan ON plan.id = subscription.plan_id`),
      pool.query(`SELECT TO_CHAR(date_bucket.month, 'YYYY-MM') AS month, COALESCE(SUM(plan.monthly_price) FILTER (WHERE subscription.status = 'active'), 0)::numeric AS revenue, COUNT(subscription.id) FILTER (WHERE subscription.status = 'active')::int AS active_subscriptions FROM generate_series(DATE_TRUNC('month', NOW()) - INTERVAL '11 months', DATE_TRUNC('month', NOW()), INTERVAL '1 month') date_bucket(month) LEFT JOIN nexus_subscriptions subscription ON subscription.started_at < date_bucket.month + INTERVAL '1 month' AND subscription.status = 'active' LEFT JOIN nexus_plans plan ON plan.id = subscription.plan_id GROUP BY date_bucket.month ORDER BY date_bucket.month`),
      pool.query(`SELECT product.name AS product_name, product.slug, COUNT(subscription.id) FILTER (WHERE subscription.status = 'active')::int AS active_subscriptions, COALESCE(SUM(plan.monthly_price) FILTER (WHERE subscription.status = 'active'), 0)::numeric AS mrr FROM nexus_products product LEFT JOIN nexus_plans plan ON plan.product_id = product.id LEFT JOIN nexus_subscriptions subscription ON subscription.plan_id = plan.id WHERE product.status <> 'archived' GROUP BY product.id ORDER BY mrr DESC, product.name`),
    ]);
    return res.json({ summary: summary.rows[0], monthly: monthly.rows, products: products.rows });
  } catch (error) { return next(error); }
});

router.get("/subscriptions", async (req, res, next) => {
  try {
    const status = String(req.query.status || "all").trim().toLowerCase();
    const result = await pool.query(`SELECT subscription.id, subscription.status, subscription.started_at, subscription.ends_at, tenant.name AS tenant_name, tenant.slug AS tenant_slug, tenant.billing_status, plan.name AS plan_name, plan.monthly_price, product.name AS product_name, product.slug AS product_slug FROM nexus_subscriptions subscription JOIN nexus_tenants tenant ON tenant.id = subscription.tenant_id JOIN nexus_plans plan ON plan.id = subscription.plan_id JOIN nexus_products product ON product.id = plan.product_id WHERE ($1 = 'all' OR subscription.status = $1) ORDER BY subscription.started_at DESC`, [status]);
    return res.json({ subscriptions: result.rows });
  } catch (error) { return next(error); }
});

router.get("/executive", async (req, res, next) => {
  try {
    const end = dateParam(req.query.to, new Date());
    const defaultStart = new Date(end); defaultStart.setDate(defaultStart.getDate() - 30);
    const start = dateParam(req.query.from, defaultStart);
    const [summary, trends, tracks] = await Promise.all([
      pool.query(`SELECT
        COALESCE((SELECT SUM(plan.monthly_price) FROM nexus_subscriptions subscription JOIN nexus_plans plan ON plan.id = subscription.plan_id WHERE subscription.status = 'active'), 0)::numeric AS mrr,
        (SELECT COUNT(*) FROM nexus_subscriptions WHERE status = 'active')::int AS active_subscriptions,
        (SELECT COUNT(*) FROM studycode_users)::int AS total_students,
        (SELECT COUNT(*) FROM studycode_users WHERE active = TRUE)::int AS active_students,
        (SELECT COUNT(*) FROM studycode_users WHERE COALESCE(last_active_at, created_at) >= $1 AND COALESCE(last_active_at, created_at) < $2)::int AS active_students_period,
        (SELECT COUNT(*) FROM studycode_lesson_progress WHERE completed_at >= $1 AND completed_at < $2)::int AS completed_lessons,
        (SELECT COUNT(*) FROM studycode_ai_questions WHERE created_at >= $1 AND created_at < $2)::int AS ai_questions,
        (SELECT COALESCE(SUM(amount), 0) FROM studycode_coin_transactions WHERE created_at >= $1 AND created_at < $2)::int AS coins_moved,
        (SELECT COUNT(*) FROM studycode_certificates WHERE issued_at >= $1 AND issued_at < $2)::int AS certificates_issued,
        (SELECT COUNT(*) FROM studycode_feedback WHERE status IN ('open', 'in_progress'))::int AS open_feedback`, [start, end]),
      pool.query(`SELECT days.day::date AS day,
        (SELECT COUNT(*) FROM studycode_users WHERE created_at >= days.day AND created_at < days.day + INTERVAL '1 day')::int AS new_students,
        (SELECT COUNT(*) FROM studycode_users WHERE COALESCE(last_active_at, created_at) >= days.day AND COALESCE(last_active_at, created_at) < days.day + INTERVAL '1 day')::int AS active_students,
        (SELECT COUNT(*) FROM studycode_lesson_progress WHERE completed_at >= days.day AND completed_at < days.day + INTERVAL '1 day')::int AS completed_lessons,
        (SELECT COUNT(*) FROM studycode_ai_questions WHERE created_at >= days.day AND created_at < days.day + INTERVAL '1 day')::int AS ai_questions
        FROM generate_series(DATE_TRUNC('day', $1::timestamptz), DATE_TRUNC('day', $2::timestamptz) - INTERVAL '1 day', INTERVAL '1 day') days(day) ORDER BY days.day`, [start, end]),
      pool.query(`SELECT track.name, COUNT(progress.id) FILTER (WHERE progress.completed_at IS NOT NULL)::int AS completed_lessons, COUNT(DISTINCT progress.user_id)::int AS students FROM studycode_tracks track LEFT JOIN studycode_modules module ON module.track_id = track.id LEFT JOIN studycode_lessons lesson ON lesson.module_id = module.id LEFT JOIN studycode_lesson_progress progress ON progress.lesson_id = lesson.id WHERE track.active = TRUE GROUP BY track.id ORDER BY completed_lessons DESC, track.name LIMIT 8`),
    ]);
    return res.json({ period: { from: start.toISOString(), to: end.toISOString() }, summary: summary.rows[0], trends: trends.rows, tracks: tracks.rows });
  } catch (error) { return next(error); }
});

router.get("/audit", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const search = String(req.query.search || "").trim();
    const result = await pool.query(`SELECT log.id, log.action, log.entity_type, log.entity_id, log.metadata, log.created_at, admin.name AS admin_name, admin.email AS admin_email FROM nexus_audit_logs log LEFT JOIN nexus_admin_users admin ON admin.id = log.admin_user_id WHERE ($1 = '' OR log.action ILIKE '%' || $1 || '%' OR log.entity_type ILIKE '%' || $1 || '%' OR admin.name ILIKE '%' || $1 || '%') ORDER BY log.created_at DESC LIMIT $2`, [search, limit]);
    return res.json({ logs: result.rows });
  } catch (error) { return next(error); }
});

export default router;
