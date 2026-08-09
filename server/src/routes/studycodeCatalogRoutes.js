import { Router } from "express";
import { pool } from "../config/database.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const productKey = String(req.query.productKey || "studycode").trim().toLowerCase();
    const result = await pool.query(
      `SELECT p.id, p.name, p.slug, p.description, p.monthly_price, p.features, p.display_order
       FROM nexus_plans p
       JOIN nexus_products product ON product.id = p.product_id
       WHERE product.slug = $1 AND product.status <> 'archived' AND p.active = TRUE
       ORDER BY p.display_order, p.monthly_price, p.name`,
      [productKey],
    );
    return res.json({ productKey, plans: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/coins", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT pack.id, pack.slug, pack.name, pack.coin_amount, pack.price,
         pack.currency, pack.stripe_price_id, pack.display_order
       FROM studycode_coin_packs pack
       JOIN nexus_products product ON product.id = pack.product_id
       WHERE product.slug = 'studycode'
         AND product.status <> 'archived'
         AND pack.active = TRUE
       ORDER BY pack.display_order, pack.coin_amount`,
    );
    return res.json({ productKey: "studycode", packs: result.rows });
  } catch (error) {
    return next(error);
  }
});

export default router;
