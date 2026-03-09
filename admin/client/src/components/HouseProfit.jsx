import { useState, useEffect } from 'react';
import { get } from '../services/api';

const PERIODS = ['game', 'day', 'week', 'month'];

export default function HouseProfit() {
  const [period,  setPeriod]  = useState('day');
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    get(`/api/admin/stats/house?period=${period}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [period]);

  const totalProfit = data.reduce((sum, r) => sum + Number(r.house_profit || 0), 0);

  function periodLabel(p) {
    return { game: 'Per Game', day: 'Daily', week: 'Weekly', month: 'Monthly' }[p];
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>House P&amp;L</h2>
        <div className="tab-row">
          {PERIODS.map(p => (
            <button key={p} className={`tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {periodLabel(p)}
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
              <span className="summary-label">Total House Profit</span>
              <span className={`summary-value ${totalProfit >= 0 ? 'green' : 'red'}`}>
                {totalProfit.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{period === 'game' ? 'Round ID' : 'Period'}</th>
                  {period === 'game' && <th>Crash @</th>}
                  <th>Total Bet</th>
                  <th>Total Payout</th>
                  <th>House Profit</th>
                  <th>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={6} className="empty-cell">No data for this period.</td></tr>
                ) : data.map((row, i) => (
                  <tr key={i} className={Number(row.house_profit) >= 0 ? 'row-green' : 'row-red'}>
                    <td>{row.label}</td>
                    {period === 'game' && <td>{row.crash_point}x</td>}
                    <td>{Number(row.total_bet).toFixed(2)}</td>
                    <td>{Number(row.total_payout).toFixed(2)}</td>
                    <td className={Number(row.house_profit) >= 0 ? 'green' : 'red'}>
                      {Number(row.house_profit).toFixed(2)}
                    </td>
                    <td>{row.margin_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
