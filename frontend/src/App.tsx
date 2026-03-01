import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import ShouldIGo from './pages/ShouldIGo';
import Traffic from './pages/Traffic';
import './index.css';

function App() {
  return (
    <Router>
      <div className="app-shell">
        <Navbar />
        <div className="page-content">
          <Routes>
            <Route index element={<ShouldIGo />} />
            <Route path="traffic" element={<Traffic />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;