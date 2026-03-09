import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import OtpInput from '../components/OtpInput';

const RESEND_DELAY = 30;

export default function SignIn() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (isAuthenticated) navigate('/home', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer]);

  const fullPhone = `${countryCode}${phone}`;

  async function handleSendOTP(e) {
    e.preventDefault();
    setError('');

    if (!/^\d{10}$/.test(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      await sendOTP(fullPhone);
      setStep('otp');
      setResendTimer(RESEND_DELAY);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(e) {
    e.preventDefault();
    setError('');

    if (otp.length !== 6) {
      setError('Enter the 6-digit OTP.');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await verifyOTP(fullPhone, otp);
      login(user, token);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return;
    setError('');
    setOtp('');
    setLoading(true);
    try {
      await sendOTP(fullPhone);
      setResendTimer(RESEND_DELAY);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">🎮</div>
        <h1 className="auth-title">Ga<span id="logo-clr">mify</span></h1>
        <p className="auth-subtitle">
          {step === 'phone'
            ? 'Enter your mobile number to continue'
            : `OTP sent to ${fullPhone}`}
        </p>

        {error && <div className="auth-error">{error}</div>}

        {step === 'phone' ? (
          <form onSubmit={handleSendOTP} noValidate>
            <div className="phone-field">
              <select
                className="country-code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                disabled={loading}
              >
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+61">🇦🇺 +61</option>
                <option value="+971">🇦🇪 +971</option>
                <option value="+65">🇸🇬 +65</option>
              </select>
              <input
                className="phone-input"
                type="tel"
                placeholder="Mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                disabled={loading}
                autoFocus
              />
            </div>

            <button className="auth-btn" type="submit" disabled={loading || !phone}>
              {loading ? <span className="spinner" /> : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} noValidate>
            <OtpInput value={otp} onChange={setOtp} disabled={loading} />

            <button
              className="auth-btn"
              type="submit"
              disabled={loading || otp.length !== 6}
            >
              {loading ? <span className="spinner" /> : 'Verify & Sign In'}
            </button>

            <div className="resend-row">
              {resendTimer > 0 ? (
                <span className="resend-timer">Resend OTP in {resendTimer}s</span>
              ) : (
                <button
                  type="button"
                  className="resend-btn"
                  onClick={handleResend}
                  disabled={loading}
                >
                  Resend OTP
                </button>
              )}
              <button
                type="button"
                className="back-btn"
                onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
              >
                Change number
              </button>
            </div>
          </form>
        )}

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="auth-link">Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
