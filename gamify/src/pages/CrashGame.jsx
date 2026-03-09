import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGameSocket } from '../hooks/useGameSocket';
import CrashChart from '../components/crash/CrashChart';
import BetPanel from '../components/crash/BetPanel';
import ActiveBets from '../components/crash/ActiveBets';
import RoundHistory from '../components/crash/RoundHistory';
import DepositModal from '../components/crash/DepositModal';
import { loadSound, playSound, loopSound, stopSound, unlockAudio } from '../utils/sound';
import startSfx from '../assets/sounds/Start.mp3';
import crashSfx from '../assets/sounds/crash.mp3';
import flySfx from '../assets/sounds/fly.mp3';

// Empty string → same-origin (production via Nginx). Explicit URL → local dev.
const BASE_URL = import.meta.env.VITE_GAME_ENGINE_URL || '';

export default function CrashGame() {
  const { user, token, logout } = useAuth();
  const {
    gameState, multiplier, elapsed, bets,
    balance, setBalance, connected, error,
    placeBet, cashout,
  } = useGameSocket({
    onStart: () => { playSound('start'); loopSound('fly'); },
    onCrash: () => { playSound('crash'); stopSound('fly'); },
  });

  const [history, setHistory] = useState([]);
  const [depositOpen, setDepositOpen] = useState(false);

  // Decode audio files into Web Audio buffers once on mount
  useEffect(() => {
    loadSound('start', startSfx);
    loadSound('crash', crashSfx);
    loadSound('fly', flySfx);

    // Unlock AudioContext on first user interaction
    window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', unlockAudio, true);
  }, []);

  // Fetch round history + initial balance
  useEffect(() => {
    fetch(`${BASE_URL}/api/game/history`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setHistory(data.rounds); })
      .catch(() => {});

    if (token) {
      fetch(`${BASE_URL}/api/game/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => { if (data.success) setBalance(data.balance); })
        .catch(() => {});
    }
  }, [token, setBalance]);

  // Append crashed round to history
  useEffect(() => {
    if (gameState?.status === 'crashed' && gameState.id) {
      setHistory((prev) => {
        const already = prev.some((r) => r.id === gameState.id);
        if (already) return prev;
        return [
          { id: gameState.id, crash_point: gameState.crashPoint },
          ...prev,
        ].slice(0, 20);
      });
    }
  }, [gameState]);

  const status = gameState?.status ?? 'idle';
  const timeRemaining = gameState?.timeRemaining;
  const crashPoint = gameState?.crashPoint;

  return (
    <div className="crash-page">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="crash-header">
        <Link to="/home" className="crash-back-link"><button>← Home</button></Link>
        <h1 className="crash-title">Gamify</h1>
        <div className="crash-header-right">
          {!connected && (
            <span className="crash-conn-badge crash-conn-badge--off">
              {error ? 'Error' : 'Connecting…'}
            </span>
          )}
          {connected && (
            <span className="crash-conn-badge crash-conn-badge--on">Live</span>
          )}
          <button className="crash-deposit-btn" onClick={() => setDepositOpen(true)}>+ Deposit</button>
          <button className="crash-logout-btn" onClick={logout}>Sign out</button>
        </div>
      </header>

      {depositOpen && <DepositModal onClose={() => setDepositOpen(false)} />}

      {/* ── Round history strip ──────────────────────────────── */}
      <RoundHistory rounds={history} />

      {/* ── Main layout ──────────────────────────────────────── */}
      <div className="crash-layout">
        {/* Chart */}
        <div className="crash-chart-wrap">
          <CrashChart
            status={status}
            multiplier={multiplier}
            elapsed={elapsed}
            crashPoint={crashPoint}
            timeRemaining={timeRemaining}
          />
        </div>

        {/* Right panel */}
        <div className="crash-right-panel">
          <BetPanel
            status={status}
            balance={balance}
            bets={bets}
            userId={user?.userId ?? user?.id}
            placeBet={placeBet}
            cashout={cashout}
            multiplier={multiplier}
          />
          <ActiveBets bets={bets} multiplier={multiplier} status={status} />
        </div>
      </div>

      {/* ── Provably fair link ───────────────────────────────── */}
      {/* {gameState?.status === 'crashed' && gameState?.serverSeed && (
        <div className="crash-fair-bar">
          <span>Round #{gameState.id} — seed hash: </span>
          <code className="crash-seed-hash">{gameState.serverSeedHash?.slice(0, 16)}…</code>
          <span> revealed: </span>
          <code className="crash-seed-hash">{gameState.serverSeed?.slice(0, 16)}…</code>
        </div>
      )} */}
    </div>
  );
}
