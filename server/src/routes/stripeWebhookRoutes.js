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
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object;
      const paymentMethod = session.payment_method_types?.[0] || "stripe";
      await pool.query(`UPDATE nexus_billing_payments SET status = 'paid', paid_at = NOW(), payment_method = $1, updated_at = NOW() WHERE provider = 'stripe' AND external_id = $2`, [paymentMethod, session.id]);
    }
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;
      await pool.query(`UPDATE nexus_billing_payments SET status = 'past_due', updated_at = NOW() WHERE provider = 'stripe' AND external_id = $1`, [session.id]);
    }
    return res.json({ received: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Não foi possível processar o evento Stripe." });
  }
});

export default router;
