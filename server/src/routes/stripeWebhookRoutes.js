import { Router } from "express";
import Stripe from "stripe";
import { env } from "../config/env.js";
import { pool } from "../config/database.js";

const router = Router();
const STUDYCODE_PRODUCT_ID = "StudyCode";

function stripeId(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
}

function subscriptionPeriodEnd(subscription) {
  const itemPeriodEnds = subscription?.items?.data
    ?.map((item) => item.current_period_end)
    .filter(Boolean) || [];
  const seconds = itemPeriodEnds.sort((a, b) => b - a)[0] || subscription?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

function invoicePeriodEnd(invoice) {
  const seconds = invoice?.lines?.data
    ?.map((line) => line.period?.end)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  return seconds ? new Date(seconds * 1000) : null;
}

function subscriptionStatus(subscription) {
  if (["active", "trialing"].includes(subscription.status)) return "active";
  if (subscription.status === "past_due") return "past_due";
  if (["incomplete", "unpaid"].includes(subscription.status)) return "failed";
  if (subscription.status === "incomplete_expired") return "expired";
  if (subscription.status === "canceled") return "cancelled";
  return "pending";
}

async function updateStudentAccess(client, payment, enabled) {
  if (!payment?.studycode_user_id) return;
  if (enabled && payment.plan_id) {
    await client.query(
      "UPDATE studycode_users SET plan_id = $1, updated_at = NOW() WHERE id = $2",
      [payment.plan_id, payment.studycode_user_id],
    );
    return;
  }
  await client.query(
    "UPDATE studycode_users SET plan_id = NULL, updated_at = NOW() WHERE id = $1 AND ($2::uuid IS NULL OR plan_id = $2)",
    [payment.studycode_user_id, payment.plan_id],
  );
}

async function paymentBySubscription(client, subscriptionId) {
  if (!subscriptionId) return null;
  let result = await client.query(
    `SELECT id, studycode_user_id, plan_id, plan_slug, subscription_id
     FROM studycode_billing_payments
     WHERE subscription_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [subscriptionId],
  );
  return result.rows[0] || null;
}

async function paymentByMetadata(client, metadata, subscriptionId = null) {
  if (!metadata?.studyCode_user_id || metadata.product_id !== STUDYCODE_PRODUCT_ID) return null;
  const result = await client.query(
    `WITH candidate AS (
       SELECT id FROM studycode_billing_payments
       WHERE studycode_user_id = $1
         AND ($2 = '' OR plan_id = NULLIF($2, '')::uuid)
       ORDER BY created_at DESC LIMIT 1
     )
     UPDATE studycode_billing_payments payment
     SET subscription_id = COALESCE(payment.subscription_id, $3), updated_at = NOW()
     FROM candidate WHERE payment.id = candidate.id
     RETURNING payment.id, payment.studycode_user_id, payment.plan_id,
       payment.plan_slug, payment.subscription_id`,
    [metadata.studyCode_user_id, metadata.dashboard_plan_id || "", subscriptionId],
  );
  return result.rows[0] || null;
}

async function processCheckout(client, stripe, session, eventType) {
  const metadata = session.metadata || {};
  const userId = metadata.studyCode_user_id;
  if (!userId || metadata.product_id !== STUDYCODE_PRODUCT_ID) return false;

  const subscriptionId = stripeId(session.subscription);
  const paymentIntentId = stripeId(session.payment_intent);
  let subscription = null;
  if (subscriptionId) subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const paid = eventType === "checkout.session.async_payment_succeeded" || session.payment_status === "paid";
  const failed = eventType === "checkout.session.async_payment_failed";
  const status = failed ? "failed" : paid ? "active" : "pending";
  const amount = Number(session.amount_total || session.amount_subtotal || 0) / 100
    || Number(metadata.amount_brl || 0);
  const customerId = stripeId(session.customer) || stripeId(subscription?.customer);
  const nextBillingAt = subscriptionPeriodEnd(subscription);

  const result = await client.query(
    `INSERT INTO studycode_billing_payments
      (studycode_user_id, tenant_id, product_id, plan_id, plan_slug, provider,
       amount, currency, payment_method, checkout_session_id, payment_intent_id,
       subscription_id, stripe_customer_id, status, started_at, next_billing_at,
       cancel_at_period_end, provider_payload)
     VALUES ($1, NULLIF($2, '')::uuid, 'StudyCode', NULLIF($3, '')::uuid, $4,
       'stripe', $5, $6, $7, $8, $9, $10, $11, $12,
       CASE WHEN $12 = 'active' THEN NOW() ELSE NULL END, $13, $14, $15)
     ON CONFLICT (checkout_session_id) DO UPDATE SET
       status = EXCLUDED.status,
       payment_method = COALESCE(EXCLUDED.payment_method, studycode_billing_payments.payment_method),
       payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, studycode_billing_payments.payment_intent_id),
       subscription_id = COALESCE(EXCLUDED.subscription_id, studycode_billing_payments.subscription_id),
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, studycode_billing_payments.stripe_customer_id),
       started_at = COALESCE(studycode_billing_payments.started_at, EXCLUDED.started_at),
       next_billing_at = COALESCE(EXCLUDED.next_billing_at, studycode_billing_payments.next_billing_at),
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       provider_payload = EXCLUDED.provider_payload,
       updated_at = NOW()
     RETURNING id, studycode_user_id, plan_id, plan_slug, subscription_id`,
    [
      userId,
      metadata.tenant_id || "",
      metadata.dashboard_plan_id || "",
      metadata.plan_id || "premium",
      amount,
      session.currency || "brl",
      session.payment_method_types?.[0] || "stripe",
      session.id,
      paymentIntentId,
      subscriptionId,
      customerId,
      status,
      nextBillingAt,
      Boolean(subscription?.cancel_at_period_end),
      JSON.stringify(session),
    ],
  );
  const payment = result.rows[0];
  if (status === "active" && !subscriptionId) {
    await client.query(
      `INSERT INTO studycode_billing_transactions
        (billing_payment_id, studycode_user_id, plan_id, provider,
         checkout_session_id, payment_intent_id, amount, currency, status,
         payment_method, paid_at, provider_payload)
       VALUES ($1, $2, $3, 'stripe', $4, $5, $6, $7, 'paid', $8, NOW(), $9)
       ON CONFLICT (checkout_session_id) DO UPDATE SET
         payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, studycode_billing_transactions.payment_intent_id),
         amount = EXCLUDED.amount, currency = EXCLUDED.currency, status = 'paid',
         payment_method = COALESCE(EXCLUDED.payment_method, studycode_billing_transactions.payment_method),
         paid_at = COALESCE(studycode_billing_transactions.paid_at, NOW()),
         provider_payload = EXCLUDED.provider_payload, updated_at = NOW()`,
      [
        payment.id,
        payment.studycode_user_id,
        payment.plan_id,
        session.id,
        paymentIntentId,
        amount,
        session.currency || "brl",
        session.payment_method_types?.[0] || "stripe",
        JSON.stringify(session),
      ],
    );
  }
  if (status === "active") await updateStudentAccess(client, payment, true);
  if (["failed", "expired", "cancelled"].includes(status)) await updateStudentAccess(client, payment, false);
  return true;
}

async function processCodeCoinCheckout(client, session, eventType) {
  const metadata = session.metadata || {};
  if (metadata.product_type !== "codecoin" || metadata.product_id !== STUDYCODE_PRODUCT_ID) return false;

  const expired = eventType === "checkout.session.expired";
  const failed = eventType === "checkout.session.async_payment_failed";
  const paid = eventType === "checkout.session.async_payment_succeeded" || session.payment_status === "paid";
  const status = expired ? "cancelled" : failed ? "failed" : paid ? "paid" : "pending";
  const paymentIntentId = stripeId(session.payment_intent);
  const amount = Number(session.amount_total || session.amount_subtotal || 0) / 100
    || Number(metadata.amount_brl || 0);
  let result = await client.query(
    `UPDATE studycode_codecoin_purchases
     SET status = $2,
         payment_intent_id = COALESCE($3, payment_intent_id),
         payment_method = COALESCE($4, payment_method),
         paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
         provider_payload = $5,
         updated_at = NOW()
     WHERE checkout_session_id = $1
     RETURNING id, studycode_user_id, coin_amount, pack_slug, status`,
    [
      session.id,
      status,
      paymentIntentId,
      session.payment_method_types?.[0] || "stripe",
      JSON.stringify(session),
    ],
  );
  let purchase = result.rows[0];
  // O webhook pode chegar antes de a requisição do aplicativo terminar de
  // salvar a compra. Nesse caso, recriamos o registro usando a metadata
  // assinada pela nossa API e mantemos o mesmo identificador Stripe.
  if (!purchase && metadata.pack_id && metadata.studyCode_user_id) {
    result = await client.query(
      `INSERT INTO studycode_codecoin_purchases
        (studycode_user_id, pack_id, pack_slug, coin_amount, provider, amount,
         currency, checkout_session_id, status, provider_payload)
       VALUES ($1, $2::uuid, $3, $4::int, 'stripe', $5, $6, $7, $8, $9)
       ON CONFLICT (checkout_session_id) DO UPDATE SET
         status = EXCLUDED.status, provider_payload = EXCLUDED.provider_payload,
         updated_at = NOW()
       RETURNING id, studycode_user_id, coin_amount, pack_slug, status`,
      [
        metadata.studyCode_user_id,
        metadata.pack_id,
        metadata.pack_slug || metadata.plan_id || "codecoins",
        metadata.coin_amount,
        amount,
        session.currency || "brl",
        session.id,
        status,
        JSON.stringify(session),
      ],
    );
    purchase = result.rows[0];
  }
  if (!purchase) return false;

  if (status === "paid") {
    await client.query(
      `INSERT INTO studycode_coin_transactions
        (user_id, amount, reason, purchase_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (purchase_id) DO NOTHING`,
      [
        purchase.studycode_user_id,
        purchase.coin_amount,
        `Compra de ${purchase.coin_amount} CodeCoins (${purchase.pack_slug}) via Stripe`,
        purchase.id,
      ],
    );
  }
  return true;
}

async function processInvoice(client, invoice, succeeded) {
  const subscriptionId = stripeId(invoice.subscription)
    || stripeId(invoice.parent?.subscription_details?.subscription);
  const metadata = invoice.parent?.subscription_details?.metadata || invoice.subscription_details?.metadata || {};
  const payment = await paymentBySubscription(client, subscriptionId)
    || await paymentByMetadata(client, metadata, subscriptionId);
  if (!payment) return false;

  const paymentIntentId = stripeId(invoice.payment_intent)
    || stripeId(invoice.payments?.data?.[0]?.payment?.payment_intent);
  const status = succeeded ? "active" : "past_due";
  const transactionStatus = succeeded ? "paid" : "failed";
  const amountCents = succeeded ? invoice.amount_paid : invoice.amount_due;
  const amount = Number(amountCents || 0) / 100;
  const nextBillingAt = invoicePeriodEnd(invoice);

  await client.query(
    `UPDATE studycode_billing_payments
     SET status = $2,
         payment_intent_id = COALESCE(payment_intent_id, $3),
         payment_method = COALESCE(payment_method, $4),
         next_billing_at = COALESCE($5, next_billing_at),
         started_at = CASE WHEN $2 = 'active' THEN COALESCE(started_at, NOW()) ELSE started_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [payment.id, status, paymentIntentId, invoice.collection_method || "card", nextBillingAt],
  );

  await client.query(
    `INSERT INTO studycode_billing_transactions
      (billing_payment_id, studycode_user_id, plan_id, provider, invoice_id,
       payment_intent_id, amount, currency, status, payment_method, paid_at, provider_payload)
     VALUES ($1, $2, $3, 'stripe', $4, $5, $6, $7, $8, $9,
       CASE WHEN $8 = 'paid' THEN NOW() ELSE NULL END, $10)
     ON CONFLICT (invoice_id) DO UPDATE SET
       payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, studycode_billing_transactions.payment_intent_id),
       amount = EXCLUDED.amount, currency = EXCLUDED.currency, status = EXCLUDED.status,
       payment_method = COALESCE(EXCLUDED.payment_method, studycode_billing_transactions.payment_method),
       paid_at = COALESCE(EXCLUDED.paid_at, studycode_billing_transactions.paid_at),
       provider_payload = EXCLUDED.provider_payload, updated_at = NOW()`,
    [
      payment.id,
      payment.studycode_user_id,
      payment.plan_id,
      invoice.id,
      paymentIntentId,
      amount,
      invoice.currency || "brl",
      transactionStatus,
      invoice.collection_method || "card",
      JSON.stringify(invoice),
    ],
  );

  await updateStudentAccess(client, payment, succeeded);
  return true;
}

async function processSubscription(client, subscription, deleted = false) {
  const payment = await paymentBySubscription(client, subscription.id)
    || await paymentByMetadata(client, subscription.metadata || {}, subscription.id);
  if (!payment) return false;
  const status = deleted ? "cancelled" : subscriptionStatus(subscription);
  const nextBillingAt = subscriptionPeriodEnd(subscription);
  const cancelled = deleted || status === "cancelled";

  await client.query(
    `UPDATE studycode_billing_payments
     SET status = $2, stripe_customer_id = COALESCE($3, stripe_customer_id),
         next_billing_at = COALESCE($4, next_billing_at),
         cancel_at_period_end = $5,
         cancelled_at = CASE WHEN $6 THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [payment.id, status, stripeId(subscription.customer), nextBillingAt, Boolean(subscription.cancel_at_period_end), cancelled],
  );

  await updateStudentAccess(client, payment, status === "active");
  return true;
}

router.post("/stripe", async (req, res) => {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
    return res.status(503).json({ error: "Webhook Stripe ainda nao configurado." });
  }
  const stripe = new Stripe(env.stripeSecretKey);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], env.stripeWebhookSecret);
  } catch (error) {
    return res.status(400).json({ error: `Assinatura Stripe invalida: ${error.message}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `INSERT INTO studycode_billing_events (event_id, provider, event_type, payload)
       VALUES ($1, 'stripe', $2, $3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type, JSON.stringify(event)],
    );
    if (!claimed.rowCount) {
      await client.query("ROLLBACK");
      return res.json({ received: true, duplicate: true });
    }

    let handledStudyCode = false;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
      const sessionMetadata = event.data.object?.metadata || {};
      handledStudyCode = sessionMetadata.product_type === "codecoin"
        ? await processCodeCoinCheckout(client, event.data.object, event.type)
        : await processCheckout(client, stripe, event.data.object, event.type);
    } else if (["invoice.paid", "invoice.payment_succeeded"].includes(event.type)) {
      handledStudyCode = await processInvoice(client, event.data.object, true);
    } else if (event.type === "invoice.payment_failed") {
      handledStudyCode = await processInvoice(client, event.data.object, false);
    } else if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
      handledStudyCode = await processSubscription(client, event.data.object, false);
    } else if (event.type === "customer.subscription.deleted") {
      handledStudyCode = await processSubscription(client, event.data.object, true);
    }

    const session = event.data.object;
    if (!handledStudyCode && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const paymentMethod = session.payment_method_types?.[0] || "stripe";
      await client.query(
        `UPDATE nexus_billing_payments SET status = 'paid', paid_at = NOW(),
         payment_method = $1, updated_at = NOW()
         WHERE provider = 'stripe' AND external_id = $2`,
        [paymentMethod, session.id],
      );
    }
    if (!handledStudyCode && event.type === "checkout.session.async_payment_failed") {
      await client.query(
        `UPDATE nexus_billing_payments SET status = 'past_due', updated_at = NOW()
         WHERE provider = 'stripe' AND external_id = $1`,
        [session.id],
      );
    }

    await client.query("COMMIT");
    return res.json({ received: true, handledStudyCode });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ error: "Nao foi possivel processar o evento Stripe." });
  } finally {
    client.release();
  }
});

export default router;
