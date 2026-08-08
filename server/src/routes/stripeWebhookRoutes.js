import { Router } from "express";
import Stripe from "stripe";
import { env } from "../config/env.js";
import { pool } from "../config/database.js";

const router = Router();

router.post("/stripe", async (req, res) => {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) return res.status(503).json({ error: "Webhook Stripe ainda não configurado." });
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    const stripe = new Stripe(env.stripeSecretKey);
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
  } catch (error) {
    return res.status(400).json({ error: `Assinatura Stripe inválida: ${error.message}` });
  }
  try {
    const session = event.data.object;
    const studycodeMetadata = session.metadata || {};
    const studycodeUserId = studycodeMetadata.studyCode_user_id;
    if (studycodeUserId && studycodeMetadata.product_id === "StudyCode") {
      const eventClaim = await pool.query(
        `INSERT INTO studycode_billing_events (event_id, provider, event_type, payload)
         VALUES ($1, 'stripe', $2, $3) ON CONFLICT (event_id) DO NOTHING`,
        [event.id, event.type, JSON.stringify(event)],
      );
      if (eventClaim.rowCount > 0) {
        const succeeded = ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type);
        const failed = event.type === "checkout.session.async_payment_failed";
        if (succeeded || failed) {
          const status = succeeded ? "active" : "failed";
          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
          const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
          const paymentMethod = session.payment_method_types?.[0] || "stripe";
          const amount = Number(studycodeMetadata.amount_brl || 0);
          await pool.query(`
            INSERT INTO studycode_billing_payments
              (studycode_user_id, tenant_id, product_id, plan_id, plan_slug, provider, amount, payment_method, checkout_session_id, payment_intent_id, subscription_id, status, started_at, provider_payload)
            VALUES ($1, NULLIF($2, '')::uuid, 'StudyCode', NULLIF($3, '')::uuid, 'premium', 'stripe', $4, $5, $6, $7, $8, $9, CASE WHEN $9 = 'active' THEN NOW() ELSE NULL END, $10)
            ON CONFLICT (checkout_session_id) DO UPDATE SET
              status = EXCLUDED.status, payment_method = EXCLUDED.payment_method,
              payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, studycode_billing_payments.payment_intent_id),
              subscription_id = COALESCE(EXCLUDED.subscription_id, studycode_billing_payments.subscription_id),
              started_at = COALESCE(EXCLUDED.started_at, studycode_billing_payments.started_at),
              provider_payload = EXCLUDED.provider_payload, updated_at = NOW()`,
            [studycodeUserId, studycodeMetadata.tenant_id || "", studycodeMetadata.dashboard_plan_id || "", amount, paymentMethod, session.id, paymentIntentId, subscriptionId, status, JSON.stringify(session)],
          );
          if (succeeded && studycodeMetadata.dashboard_plan_id) {
            await pool.query("UPDATE studycode_users SET plan_id = $1, updated_at = NOW() WHERE id = $2", [studycodeMetadata.dashboard_plan_id, studycodeUserId]);
          }
        }
      }
    }
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const paymentMethod = session.payment_method_types?.[0] || "stripe";
      await pool.query(`UPDATE nexus_billing_payments SET status = 'paid', paid_at = NOW(), payment_method = $1, updated_at = NOW() WHERE provider = 'stripe' AND external_id = $2`, [paymentMethod, session.id]);
    }
    if (event.type === "checkout.session.async_payment_failed") {
      await pool.query(`UPDATE nexus_billing_payments SET status = 'past_due', updated_at = NOW() WHERE provider = 'stripe' AND external_id = $1`, [session.id]);
    }
    return res.json({ received: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Não foi possível processar o evento Stripe." });
  }
});

export default router;
