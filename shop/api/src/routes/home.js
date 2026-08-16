import express from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/validate.js';
import { PRODUCT_COLUMNS, PRODUCT_FROM, toProductCard } from '../services/catalog.js';

export const homeRouter = express.Router();

const RAIL_SIZE = 12;
const RAIL_COUNT = 6;

/**
 * One curated payload so the homepage is a single request rather than a dozen.
 * Everything here is derived from the catalog — there is no editorial table.
 */
homeRouter.get(
  '/home',
  asyncHandler(async (_req, res) => {
    const [deals, newArrivals, bestSellers, railCategories, heroCategories] = await Promise.all([
      query(
        `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
         WHERE p.list_price_cents IS NOT NULL AND p.list_price_cents > p.price_cents AND p.stock > 0
         ORDER BY (p.list_price_cents - p.price_cents)::numeric / p.list_price_cents DESC, p.rating DESC
         LIMIT $1`,
        [RAIL_SIZE],
      ),
      query(
        `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
         WHERE p.stock > 0 ORDER BY p.created_at DESC, p.rating DESC LIMIT $1`,
        [RAIL_SIZE],
      ),
      query(
        `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
         WHERE 'BEST_SELLER' = ANY(p.badges) OR p.rating_count > 0
         ORDER BY ('BEST_SELLER' = ANY(p.badges)) DESC, p.rating_count DESC, p.rating DESC
         LIMIT $1`,
        [RAIL_SIZE],
      ),
      query(
        `SELECT c.id, c.slug, c.name, c.tagline, c.icon, c.accent, c.hero_image
         FROM categories c
         JOIN products p ON p.category_id = c.id
         GROUP BY c.id
         ORDER BY count(p.id) DESC, c.sort_order
         LIMIT $1`,
        [RAIL_COUNT],
      ),
      query(
        `SELECT c.id, c.slug, c.name, c.tagline, c.icon, c.accent, c.hero_image
         FROM categories c
         WHERE c.hero_image IS NOT NULL
         ORDER BY c.sort_order LIMIT 5`,
      ),
    ]);

    // One rail query per featured category, run together.
    const rails = await Promise.all(
      railCategories.rows.map(async (c) => {
        const { rows } = await query(
          `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
           WHERE p.category_id = $1 AND p.stock > 0
           ORDER BY p.rating DESC, p.rating_count DESC LIMIT $2`,
          [c.id, RAIL_SIZE],
        );
        return {
          category: { slug: c.slug, name: c.name, tagline: c.tagline, icon: c.icon, accent: c.accent },
          products: rows.map(toProductCard),
        };
      }),
    );

    res.json({
      heroSlides: heroCategories.rows.map((c) => ({
        categorySlug: c.slug,
        title: c.name,
        tagline: c.tagline,
        image: c.hero_image,
        accent: c.accent,
        icon: c.icon,
        href: `/c/${c.slug}`,
      })),
      dealsOfTheDay: deals.rows.map(toProductCard),
      newArrivals: newArrivals.rows.map(toProductCard),
      bestSellers: bestSellers.rows.map(toProductCard),
      categoryRails: rails,
    });
  }),
);
