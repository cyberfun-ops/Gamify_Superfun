import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import msgpackParser from 'socket.io-msgpack-parser';
import { useAuth } from '../context/AuthContext';

// Empty string env var → same origin (production via Nginx proxy).
// Explicit URL → used in local dev if set.
const SOCKET_URL = import.meta.env.VITE_GAME_ENGINE_URL || window.location.origin;

export function useGameSocket({ onStart, onCrash } = {}) {
  const { token } = useAuth();
  const socketRef = useRef(null);

  // Keep callback refs current so the socket listener (set up once) always
  // calls the latest version without needing to re-attach.
  const onStartRef = useRef(onStart);
  const onCrashRef = useRef(onCrash);
  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => { onCrashRef.current = onCrash; }, [onCrash]);

  // Tracks the last known status INSIDE the socket listener (not React state)
  // so we can detect genuine transitions without React re-render timing issues.
  const prevStatusRef = useRef(null);

  const [gameState, setGameState] = useState(null);   // full state from game:state
  const [multiplier, setMultiplier] = useState(1.0);
  const [elapsed, setElapsed] = useState(0);
  const [bets, setBets] = useState([]);
  const [balance, setBalance] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      parser: msgpackParser,
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      setError(err.message);
      setConnected(false);
    });

    // Full game state (sent on connect + each phase transition)
    socket.on('game:state', (data) => {
      // Fire start sound only on a genuine starting→running transition.
      // This prevents mid-game reconnects from playing the sound.
      if (data.status === 'running' && prevStatusRef.current === 'starting') {
        onStartRef.current?.();
      }
      prevStatusRef.current = data.status;
      setGameState(data);
      setMultiplier(data.multiplier ?? 1.0);
      if (data.bets !== undefined) setBets(data.bets);
    });

    // 50ms multiplier tick during RUNNING
    socket.on('game:tick', (data) => {
      setMultiplier(data.multiplier);
      setElapsed(data.elapsed);
    });

    // Round crashed — fire sound directly from the socket event, not via React state
    socket.on('game:crash', (data) => {
      onCrashRef.current?.();
      prevStatusRef.current = 'crashed';
      setGameState((prev) => ({
        ...prev,
        status: 'crashed',
        crashPoint: data.crashPoint,
        serverSeed: data.serverSeed,
        bets: data.bets ?? prev?.bets ?? [],
      }));
      setMultiplier(data.crashPoint);
      setBets(data.bets ?? []);
    });

    // Bets list updated (new bet placed or cashout)
    socket.on('bets:list', (data) => {
      setBets(data);
    });

    // Personal balance update
    socket.on('balance:update', (data) => {
      setBalance(data.balance);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const placeBet = useCallback((amount, autoCashout = null) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) {
        return reject(new Error('Not connected to game server.'));
      }
      socketRef.current.emit('bet:place', { amount, autoCashout }, (response) => {
        if (response.success) {
          setBalance(response.newBalance);
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }, []);

  const cashout = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) {
        return reject(new Error('Not connected to game server.'));
      }
      socketRef.current.emit('bet:cashout', null, (response) => {
        if (response.success) {
          setBalance(response.newBalance);
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }, []);

  return {
    gameState,
    multiplier,
    elapsed,
    bets,
    balance,
    setBalance,
    connected,
    error,
    placeBet,
    cashout,
  };
}
