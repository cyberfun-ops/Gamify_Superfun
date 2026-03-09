/**
 * Horizontal strip of past round crash points.
 * Color coded: red < 1.5x, yellow < 2x, green >= 2x
 */
function chipColor(cp) {
  if (cp < 1.5) return 'chip--red';
  if (cp < 2.0) return 'chip--yellow';
  if (cp < 5.0) return 'chip--green';
  return 'chip--purple';
}

export default function RoundHistory({ rounds = [] }) {
  if (!rounds.length) return null;

  return (
    <div className="round-history">
      {rounds.slice(0, 30).map((r) => {
        const cp = parseFloat(r.crash_point);
        return (
          <span key={r.id} className={`crash-chip ${chipColor(cp)}`} title={`Round #${r.id}`}>
            {cp.toFixed(2)}x
          </span>
        );
      })}
    </div>
  );
}
