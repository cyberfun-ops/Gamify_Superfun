import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

// Empty string env var → same origin (production via Nginx proxy).
// Explicit URL → used in local dev if set.
const SOCKET_URL = import.meta.env.VITE_GAME_ENGINE_URL || window.location.origin;

export function useGameSocket() {
  const { token } = useAuth();
  const socketRef = useRef(null);

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
      setGameState(data);
      setMultiplier(data.multiplier ?? 1.0);
      if (data.bets !== undefined) setBets(data.bets);
    });

    // 50ms multiplier tick during RUNNING
    socket.on('game:tick', (data) => {
      setMultiplier(data.multiplier);
      setElapsed(data.elapsed);
    });

    // Round crashed
    socket.on('game:crash', (data) => {
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
