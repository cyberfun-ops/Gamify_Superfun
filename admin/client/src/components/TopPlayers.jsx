import { useState, useEffect } from 'react';
import { get } from '../services/api';

const PERIODS = ['day', 'week', 'month'];
const TYPES   = ['earners', 'losers'];

export default function TopPlayers() {
  const [period,  setPeriod]  = useState('week');
  const [type,    setType]    = useState('earners');
  const [roundId, setRoundId] = useState('');
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function fetchData() {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ period, type });
    if (roundId.trim()) params.set('roundId', roundId.trim());
    get(`/api/admin/stats/top-players?${params}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [period, type]);  // eslint-disable-line

  return (
    <section className="card">
      <div className="card-header">
        <h2>Top Players</h2>
        <div className="filter-row">
          <div className="tab-row">
            {PERIODS.map(p => (
              <button key={p} className={`tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
                {p === 'day' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
          <div className="tab-row">
            {TYPES.map(t => (
              <button key={t} className={`tab ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                {t === 'earners' ? 'Top Earners' : 'Top Losers'}
              </button>
            ))}
          </div>
          <div className="round-filter">
            <input
              type="number"
              placeholder="Filter by Round ID"
              value={roundId}
              onChange={e => setRoundId(e.target.value)}
              className="round-input"
            />
            <button className="btn-secondary" onClick={fetchData}>Apply</button>
            {roundId && (
              <button className="btn-ghost" onClick={() => { setRoundId(''); fetchData(); }}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {loading && <p className="status-msg">Loading…</p>}
      {error   && <p className="error-msg">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Net Profit</th>
                <th>Bets</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={5} className="empty-cell">No data for this period.</td></tr>
              ) : data.map(row => (
                <tr key={row.rank}>
                  <td>{row.rank}</td>
                  <td>{row.username || '—'}</td>
                  <td>{row.phone_masked}</td>
                  <td className={Number(row.net_profit) >= 0 ? 'green' : 'red'}>
                    {Number(row.net_profit).toFixed(2)}
                  </td>
                  <td>{row.bet_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
