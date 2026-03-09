import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';

const UPI_ID     = import.meta.env.VITE_UPI_ID || 'yourname@upi'; // set VITE_UPI_ID in gamify/.env
const PAYEE_NAME = 'Gamify';
const TXN_BASE   = import.meta.env.VITE_TXN_SERVER_URL || '';

export default function DepositModal({ onClose }) {
  const { token } = useAuth();
  const [step,    setStep]    = useState('qr');   // 'qr' | 'utr' | 'done'
  const [amount,  setAmount]  = useState('');
  const [utr,     setUtr]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const upiUrl = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(PAYEE_NAME)}${amount ? `&am=${amount}` : ''}&cu=INR&tn=Gamify+Deposit`;

  async function handleSubmitUtr() {
    const amt = parseFloat(amount);
    if (!utr.trim()) return setError('Enter your UTR number.');
    if (!amt || amt <= 0) return setError('Enter the deposit amount.');
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${TXN_BASE}/api/txn/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ utr: utr.trim(), amount: amt }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="deposit-modal-header">
          <h2 className="deposit-modal-title">
            {step === 'qr'   && 'Deposit'}
            {step === 'utr'  && 'Enter UTR'}
            {step === 'done' && 'Submitted!'}
          </h2>
          <button className="deposit-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Step 1: QR code ─────────────────────────────── */}
        {step === 'qr' && (
          <>
            <div className="deposit-amount-row">
              <input
                className="deposit-amount-input"
                type="number"
                placeholder="Amount (required)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                step="1"
              />
            </div>

            <div className="deposit-qr-wrap">
              <QRCodeSVG
                value={upiUrl}
                size={200}
                bgColor="#13131e"
                fgColor="#ffffff"
                level="M"
              />
            </div>

            <div className="deposit-upi-row">
              <span className="deposit-upi-label">UPI ID</span>
              <span className="deposit-upi-value">{UPI_ID}</span>
            </div>

            <p className="deposit-hint">Scan and pay, then click Next</p>

            {error && <p className="deposit-error">{error}</p>}

            <button
              className="deposit-next-btn"
              onClick={() => {
                if (!amount || parseFloat(amount) <= 0) {
                  setError('Enter the amount before proceeding.');
                  return;
                }
                setError('');
                setStep('utr');
              }}
            >
              Next →
            </button>
          </>
        )}

        {/* ── Step 2: UTR entry ───────────────────────────── */}
        {step === 'utr' && (
          <>
            <p className="deposit-amount-label">Deposit amount: <strong>₹{amount}</strong></p>

            <div className="deposit-amount-row">
              <input
                className="deposit-amount-input"
                type="text"
                placeholder="UTR / Transaction reference number"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                maxLength={50}
                autoFocus
              />
            </div>

            <p className="deposit-hint">
              Find the UTR in your UPI app or bank SMS after payment.
            </p>

            {error && <p className="deposit-error">{error}</p>}

            <div className="deposit-btn-row">
              <button
                className="deposit-back-btn"
                onClick={() => { setError(''); setStep('qr'); }}
                disabled={loading}
              >
                ← Back
              </button>
              <button className="deposit-next-btn" onClick={handleSubmitUtr} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Submit'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Done ────────────────────────────────── */}
        {step === 'done' && (
          <>
            <div className="deposit-done-icon">✓</div>
            <p className="deposit-done-text">
              UTR submitted. Your balance will be credited automatically once the payment is confirmed by the bank.
            </p>
            <button className="deposit-next-btn" onClick={onClose}>Close</button>
          </>
        )}

      </div>
    </div>
  );
}
