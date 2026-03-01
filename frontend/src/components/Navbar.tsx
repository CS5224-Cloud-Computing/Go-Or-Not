import { useNavigate, useLocation } from 'react-router-dom';

const Navbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="navbar">
      <span className="navbar-logo">Go or Not</span>
      <div className="navbar-links">
        <button
          className={`nav-btn ${pathname === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          Should I Go?
        </button>
        <button
          className={`nav-btn ${pathname === '/traffic' ? 'active' : ''}`}
          onClick={() => navigate('/traffic')}
        >
          Traffic
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
