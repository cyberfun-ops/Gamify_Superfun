import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/signin', { replace: true });
  }

  return (
    <div className="home-wrapper">
      <div className="home-card">
        <div className="home-avatar">
          {user?.name ? user.name[0].toUpperCase() : '?'}
        </div>
        <h1 className="home-title">Hey, {user?.name || 'Player'}! 👋</h1>
        <p className="home-phone">{user?.phone}</p>
        <div className="home-games">
          <Link to="/game" className="home-game-btn">
            <span className="home-game-icon">📈</span>
            <span>Gamify</span>
          </Link>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
