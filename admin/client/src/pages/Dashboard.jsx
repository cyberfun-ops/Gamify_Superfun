import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GameStats    from '../components/GameStats';
import TopPlayers   from '../components/TopPlayers';
import HouseProfit  from '../components/HouseProfit';

const SECTIONS = [
  { id: 'games',   label: 'Game Statistics' },
  { id: 'players', label: 'Top Players'     },
  { id: 'house',   label: 'House P&L'       },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [section, setSection] = useState('games');

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="dashboard-wrapper">
      <header className="dash-header">
        <span className="dash-logo">Gamify Admin</span>
        <nav className="dash-nav">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`nav-btn ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="dash-user">
          <span>{user?.username}</span>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="dash-main">
        {section === 'games'   && <GameStats />}
        {section === 'players' && <TopPlayers />}
        {section === 'house'   && <HouseProfit />}
      </main>
    </div>
  );
}
