const express = require('express');
const { query } = require('../config/db');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// All stats routes require JWT
router.use(authenticate);

// Helper: convert period string to Postgres interval
function periodToInterval(period) {
  switch (period) {
    case 'day':   return '1 day';
    case 'week':  return '7 days';
    case 'month': return '30 days';
    default:      return '7 days';
  }
}

// GET /api/admin/stats/games?period=day|week|month
// Returns daily aggregated game stats for the selected period
router.get('/games', async (req, res) => {
  try {
    const interval = periodToInterval(req.query.period);

    const result = await query(
      `SELECT
         DATE(gr.created_at) AS date,
         COUNT(*)::int        AS game_count,
         COALESCE(SUM(b_agg.total_bet),    0)::numeric AS total_bet,
         COALESCE(SUM(b_agg.total_payout), 0)::numeric AS total_payout,
         COALESCE(SUM(b_agg.total_bet - b_agg.total_payout), 0)::numeric AS house_profit
       FROM game_rounds gr
       LEFT JOIN (
         SELECT round_id,
           SUM(amount) AS total_bet,
           -- total_payout = original bet + profit gained (full amount house pays back to winner)
           SUM(CASE WHEN status = 'won' THEN amount + profit ELSE 0 END) AS total_payout
         FROM bets
         GROUP BY round_id
       ) b_agg ON b_agg.round_id = gr.id
       WHERE gr.status = 'crashed'
         AND gr.created_at > NOW() - $1::interval
       GROUP BY DATE(gr.created_at)
       ORDER BY date DESC`,
      [interval]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[stats/games]', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/stats/top-players?period=day|week|month&type=earners|losers&roundId=
// Returns top 10 earners or losers for the period (optionally filtered by round)
router.get('/top-players', async (req, res) => {
  try {
    const interval  = periodToInterval(req.query.period);
    const type      = req.query.type === 'losers' ? 'losers' : 'earners';
    const roundId   = req.query.roundId ? Number(req.query.roundId) : null;
    const orderDir  = type === 'earners' ? 'DESC' : 'ASC';

    // profit column = net gain (winAmount - betAmount), already excludes the stake
    // net_profit: won → +profit (net gain), lost → -amount (full stake lost)
    const result = await query(
      `SELECT
         ROW_NUMBER() OVER (ORDER BY
           SUM(CASE WHEN b.status = 'won' THEN b.profit ELSE -b.amount END) ${orderDir}
         )::int AS rank,
         u.name                                              AS username,
         LEFT(u.phone, 4) || '****' || RIGHT(u.phone, 3)   AS phone_masked,
         SUM(CASE WHEN b.status = 'won' THEN b.profit ELSE -b.amount END)::numeric AS net_profit,
         COUNT(*)::int                                       AS bet_count
       FROM bets b
       JOIN users u ON b.user_id = u.id
       WHERE b.created_at > NOW() - $1::interval
         AND ($2::bigint IS NULL OR b.round_id = $2)
       GROUP BY u.id, u.name, u.phone
       ORDER BY net_profit ${orderDir}
       LIMIT 10`,
      [interval, roundId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[stats/top-players]', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/stats/house?period=game|day|week|month
// Returns house P&L breakdown
router.get('/house', async (req, res) => {
  try {
    const period = req.query.period || 'day';

    let sql;
    let params = [];

    if (period === 'game') {
      // Per-game breakdown (last 50 games)
      sql = `
        SELECT
          gr.id::text              AS label,
          gr.crash_point::numeric  AS crash_point,
          gr.created_at,
          COALESCE(SUM(b.amount), 0)::numeric AS total_bet,
          -- total_payout = stake returned + profit paid (full cash house pays out)
          COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.amount + b.profit ELSE 0 END), 0)::numeric AS total_payout,
          (COALESCE(SUM(b.amount), 0) - COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.amount + b.profit ELSE 0 END), 0))::numeric AS house_profit
        FROM game_rounds gr
        LEFT JOIN bets b ON b.round_id = gr.id
        WHERE gr.status = 'crashed'
        GROUP BY gr.id, gr.crash_point, gr.created_at
        ORDER BY gr.created_at DESC
        LIMIT 50`;
    } else {
      const interval = periodToInterval(period);
      const groupBy  = period === 'month' ? "DATE_TRUNC('week', gr.created_at)"
                     : period === 'week'  ? "DATE(gr.created_at)"
                     :                      "DATE(gr.created_at)";
      sql = `
        SELECT
          ${groupBy}::text AS label,
          COALESCE(SUM(b_agg.total_bet),    0)::numeric AS total_bet,
          COALESCE(SUM(b_agg.total_payout), 0)::numeric AS total_payout,
          COALESCE(SUM(b_agg.total_bet - b_agg.total_payout), 0)::numeric AS house_profit
        FROM game_rounds gr
        LEFT JOIN (
          SELECT round_id,
            SUM(amount) AS total_bet,
            SUM(CASE WHEN status = 'won' THEN amount + profit ELSE 0 END) AS total_payout
          FROM bets GROUP BY round_id
        ) b_agg ON b_agg.round_id = gr.id
        WHERE gr.status = 'crashed'
          AND gr.created_at > NOW() - $1::interval
        GROUP BY label
        ORDER BY label DESC`;
      params = [interval];
    }

    const result = await query(sql, params);

    const data = result.rows.map(row => ({
      ...row,
      margin_pct: row.total_bet > 0
        ? Number(((row.house_profit / row.total_bet) * 100).toFixed(2))
        : 0,
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[stats/house]', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
