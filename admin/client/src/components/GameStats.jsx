import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { get } from '../services/api';

const PERIODS = ['day', 'week', 'month'];

export default function GameStats() {
  const [period, setPeriod] = useState('week');
  const [data,   setData]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    get(`/api/admin/stats/games?period=${period}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [period]);

  const totals = data.reduce(
    (acc, row) => ({
      games:  acc.games  + (row.game_count  || 0),
      bet:    acc.bet    + Number(row.total_bet    || 0),
      profit: acc.profit + Number(row.house_profit || 0),
    }),
    { games: 0, bet: 0, profit: 0 }
  );

  return (
    <section className="card">
      <div className="card-header">
        <h2>Game Statistics</h2>
        <div className="tab-row">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`tab ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p === 'day' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="status-msg">Loading…</p>}
      {error   && <p className="error-msg">{error}</p>}

      {!loading && !error && (
        <>
          <div className="summary-row">
            <div className="summary-card">
              <span className="summary-label">Total Games</span>
              <span className="summary-value">{totals.games}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Total Bet Volume</span>
              <span className="summary-value">{totals.bet.toFixed(2)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">House Profit</span>
              <span className={`summary-value ${totals.profit >= 0 ? 'green' : 'red'}`}>
                {totals.profit.toFixed(2)}
              </span>
            </div>
          </div>

          {data.length > 0 ? (
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={[...data].reverse()} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e1e2e', border: '1px solid #444', color: '#fff' }}
                    formatter={(val, name) => [Number(val).toFixed(2), name]}
                  />
                  <Bar dataKey="game_count"  name="Games"        fill="#7c6af7" radius={[4,4,0,0]} />
                  <Bar dataKey="house_profit" name="House Profit" fill="#22c55e" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="status-msg">No data for this period.</p>
          )}
        </>
      )}
    </section>
  );
}
