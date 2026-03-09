import { useState, useEffect } from 'react';
import cashoutSfx from '../../assets/sounds/Cashout.mp3';
import { loadSound, playSound } from '../../utils/sound';

const QUICK_AMOUNTS = [10, 50, 100, 500];

export default function BetPanel({ status, balance, bets, userId, placeBet, cashout, multiplier }) {
  const [amount, setAmount] = useState('');
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoCashout, setAutoCashout] = useState('2.00');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text }

  useEffect(() => { loadSound('cashout', cashoutSfx); }, []);

  const myBet = bets?.find((b) => b.userId === userId);
  const hasActiveBet = myBet && !myBet.cashedOut;
  const isRunning = status === 'running';
  const isBetting = status === 'betting';

  // Clear messages after 3s
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  async function handlePlaceBet() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setMessage({ type: 'error', text: 'Enter a valid amount.' });
    if (amt < 10) return setMessage({ type: 'error', text: 'Minimum bet is ₹10.' });
    if (balance !== null && amt > balance) {
      return setMessage({ type: 'error', text: 'Insufficient balance.' });
    }
    setLoading(true);
    try {
      const autoCashoutVal = autoCashoutEnabled ? parseFloat(autoCashout) : null;
      await placeBet(amt, autoCashoutVal);
      setMessage({ type: 'success', text: `Bet of ${amt} placed!` });
      setAmount('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleCashout() {
    setLoading(true);
    try {
      const result = await cashout();
      playSound('cashout');
      setMessage({
        type: 'success',
        text: `Cashed out @ ${result.cashoutMultiplier}x! +${result.payout.toFixed(2)}`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  function setQuick(val) {
    if (balance !== null && val > balance) setAmount(String(Math.floor(balance)));
    else setAmount(String(val));
  }

  return (
    <div className="bet-panel">
      {/* Balance */}
      <div className="bet-balance">
        <span className="bet-balance-label">Balance</span>
        <span className="bet-balance-value">
          {balance !== null ? balance.toFixed(2) : '—'}
        </span>
      </div>

      {/* Message */}
      {message && (
        <div className={`bet-message bet-message--${message.type}`}>{message.text}</div>
      )}

      {/* My active bet indicator */}
      {myBet && (
        <div className="bet-active-indicator">
          {myBet.cashedOut
            ? `Cashed out @ ${myBet.cashoutMultiplier?.toFixed(2)}x`
            : `Active bet: ${myBet.amount}`}
        </div>
      )}

      {/* Amount input */}
      <div className="bet-field">
        <label className="bet-label">Bet Amount</label>
        <input
          type="number"
          className="bet-input"
          placeholder="Min ₹10"
          min="10"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!isBetting || hasActiveBet}
        />
      </div>

      {/* Quick amounts */}
      <div className="bet-quick">
        {QUICK_AMOUNTS.map((v) => (
          <button
            key={v}
            className="bet-quick-btn"
            onClick={() => setQuick(v)}
            disabled={!isBetting || hasActiveBet}
          >
            {v}
          </button>
        ))}
        <button
          className="bet-quick-btn"
          onClick={() => setAmount(String(Math.floor(balance ?? 0)))}
          disabled={!isBetting || hasActiveBet || !balance}
        >
          MAX
        </button>
      </div>

      {/* Auto cashout */}
      <div className="bet-auto-row">
        <label className="bet-auto-label">
          <input
            type="checkbox"
            checked={autoCashoutEnabled}
            onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
            disabled={!isBetting || hasActiveBet}
          />
          <span>Auto cashout at</span>
        </label>
        <input
          type="number"
          className="bet-input bet-input--small"
          min="1.01"
          step="0.01"
          value={autoCashout}
          onChange={(e) => setAutoCashout(e.target.value)}
          disabled={!autoCashoutEnabled || !isBetting || hasActiveBet}
        />
        <span className="bet-multiplier-label">x</span>
      </div>

      {/* Action button */}
      {isRunning && hasActiveBet ? (
        <button
          className="bet-cashout-btn"
          onClick={handleCashout}
          disabled={loading}
        >
          {loading ? (
            <span className="spinner" />
          ) : (
            <>Cash Out @ <strong>{multiplier?.toFixed(2)}x</strong></>
          )}
        </button>
      ) : (
        <button
          className="bet-place-btn"
          onClick={handlePlaceBet}
          disabled={loading || !isBetting || hasActiveBet || !amount}
        >
          {loading ? <span className="spinner" /> : 'Place Bet'}
        </button>
      )}
    </div>
  );
}
