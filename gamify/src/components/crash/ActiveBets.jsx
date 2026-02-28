/**
 * Displays all active bets for the current round.
 * Updates live as players cash out.
 */
export default function ActiveBets({ bets = [], multiplier, status }) {
  if (!bets.length) {
    return (
      <div className="active-bets">
        <h3 className="active-bets-title">Players</h3>
        <p className="active-bets-empty">No bets yet this round.</p>
      </div>
    );
  }

  // Sort: cashed-out bets last
  const sorted = [...bets].sort((a, b) => {
    if (a.cashedOut === b.cashedOut) return b.amount - a.amount;
    return a.cashedOut ? 1 : -1;
  });

  return (
    <div className="active-bets">
      <h3 className="active-bets-title">Players ({bets.length})</h3>
      <div className="active-bets-table-wrap">
        <table className="active-bets-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Bet</th>
              <th>{status === 'crashed' ? 'Result' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((bet) => {
              const liveProfit = bet.cashedOut
                ? null
                : status === 'running'
                ? (bet.amount * (multiplier ?? 1) - bet.amount).toFixed(2)
                : null;

              return (
                <tr
                  key={bet.userId}
                  className={bet.cashedOut ? 'bet-row bet-row--cashed' : 'bet-row'}
                >
                  <td className="bet-row-user">{bet.username}</td>
                  <td className="bet-row-amount">{Number(bet.amount).toFixed(2)}</td>
                  <td className="bet-row-status">
                    {bet.cashedOut ? (
                      <span className="bet-tag bet-tag--win">
                        {bet.cashoutMultiplier?.toFixed(2)}x
                      </span>
                    ) : status === 'crashed' ? (
                      <span className="bet-tag bet-tag--loss">Lost</span>
                    ) : status === 'running' ? (
                      <span className="bet-tag bet-tag--live">
                        +{liveProfit}
                      </span>
                    ) : (
                      <span className="bet-tag bet-tag--waiting">Waiting</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
