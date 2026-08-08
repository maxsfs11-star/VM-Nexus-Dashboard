import { Router } from "express";
import Stripe from "stripe";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticateStudent } from "../middleware/authenticateStudent.js";

const router = Router();
const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
const APP_SUCCESS_URL = process.env.STUDYCODE_BILLING_SUCCESS_URL || "studycode://billing/success";
const APP_CANCEL_URL = process.env.STUDYCODE_BILLING_CANCEL_URL || "studycode://billing/cancel";

async function planForCheckout(planSlug = "premium") {
  const result = await pool.query(`
    SELECT plan.id, plan.name, plan.slug, plan.description, plan.monthly_price,
           plan.features, product.slug AS product_slug
    FROM nexus_plans plan
    JOIN nexus_products product ON product.id = plan.product_id
    WHERE product.slug = 'studycode' AND plan.slug = $1
      AND product.status <> 'archived' AND plan.active = TRUE
    LIMIT 1`, [planSlug]);
  return result.rows[0];
}

router.use(authenticateStudent);

router.get("/status", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT payment.id, payment.product_id, payment.plan_slug, payment.amount,
             payment.currency, payment.status, payment.provider, payment.payment_method,
             payment.started_at, payment.next_billing_at, payment.cancelled_at,
             payment.created_at, payment.updated_at
      FROM studycode_billing_payments payment
      WHERE payment.studycode_user_id = $1
      ORDER BY payment.created_at DESC LIMIT 1`, [req.student.sub]);
    return res.json({ subscription: result.rows[0] || null });
  } catch (error) { return next(error); }
});

router.get("/history", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, product_id, plan_slug, amount, currency, status, provider,
             payment_method, checkout_session_id, payment_intent_id,
             subscription_id, started_at, next_billing_at, cancelled_at,
             created_at, updated_at
      FROM studycode_billing_payments
      WHERE studycode_user_id = $1
      ORDER BY created_at DESC`, [req.student.sub]);
    return res.json({ payments: result.rows });
  } catch (error) { return next(error); }
});

router.post("/checkout-session", async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Pagamentos ainda não configurados no servidor." });
    const requestedPlan = String(req.body?.plan_id || req.body?.plan_slug || "premium").trim().toLowerCase();
    const plan = await planForCheckout(requestedPlan);
    if (!plan) return res.status(404).json({ error: "Plano do StudyCode não está disponível." });
    const studentResult = await pool.query("SELECT id, name, email FROM studycode_users WHERE id = $1 AND active = TRUE", [req.student.sub]);
    const student = studentResult.rows[0];
    if (!student) return res.status(401).json({ error: "Aluno StudyCode não encontrado." });

    // O aplicativo não envia preço. O valor vem exclusivamente do plano editado no Dashboard.
    const amount = Number(plan.monthly_price);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Este plano não exige checkout ou possui valor inválido no Dashboard." });
    const tenantId = req.body?.tenant_id ? String(req.body.tenant_id) : null;
    const features = plan.features && typeof plan.features === "object" ? plan.features : {};
    const billingType = features.billingType === "lifetime" ? "lifetime" : "recurring";
    const metadata = {
      studyCode_user_id: student.id,
      tenant_id: tenantId || "",
      product_id: "StudyCode",
      plan_id: plan.slug,
      dashboard_plan_id: plan.id,
      billing_type: billingType,
      amount_brl: amount.toFixed(2),
      student_name: student.name,
      student_email: student.email,
    };
    const priceData = {
      currency: "brl",
      unit_amount: Math.round(amount * 100),
      product_data: { name: plan.name || "StudyCode Premium", description: plan.description || undefined },
      ...(billingType === "recurring" ? { recurring: { interval: "month" } } : {}),
    };
    const session = await stripe.checkout.sessions.create({
      mode: billingType === "lifetime" ? "payment" : "subscription",
      line_items: [{
        price_data: priceData,
        quantity: 1,
      }],
      customer_email: student.email,
      success_url: APP_SUCCESS_URL,
      cancel_url: APP_CANCEL_URL,
      metadata,
      ...(billingType === "recurring" ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
      // Assinaturas recorrentes usam cartão. Boleto/Pix ficam preparados para
      // compras avulsas de CodeCoins, que terão um checkout de pagamento único.
      payment_method_types: ["card"],
    });
    await pool.query(`
      INSERT INTO studycode_billing_payments
        (studycode_user_id, tenant_id, product_id, plan_id, plan_slug, provider, amount, checkout_session_id, status, provider_payload)
      VALUES ($1, $2, 'StudyCode', $3, $4, 'stripe', $5, $6, 'pending', $7)
      ON CONFLICT (checkout_session_id) DO NOTHING`,
      [student.id, tenantId || null, plan.id, plan.slug, amount, session.id, JSON.stringify({ sessionId: session.id, metadata })]);
    return res.json({ url: session.url, sessionId: session.id, plan: { id: plan.id, slug: plan.slug, amount, billingType } });
  } catch (error) { return next(error); }
});

router.post("/cancel", async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Pagamentos ainda não configurados no servidor." });
    const result = await pool.query(`SELECT id, subscription_id FROM studycode_billing_payments WHERE studycode_user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`, [req.student.sub]);
    const subscription = result.rows[0];
    if (!subscription) return res.status(404).json({ error: "Nenhuma assinatura ativa encontrada." });
    if (subscription.subscription_id) await stripe.subscriptions.cancel(subscription.subscription_id);
    await pool.query("UPDATE studycode_billing_payments SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1", [subscription.id]);
    await pool.query("UPDATE studycode_users SET plan_id = NULL, updated_at = NOW() WHERE id = $1", [req.student.sub]);
    return res.json({ ok: true, status: "cancelled" });
  } catch (error) { return next(error); }
});

export default router;
