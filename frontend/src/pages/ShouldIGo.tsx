import { useState } from 'react';

const ShouldIGo = () => {
  const [updateHour, setUpdateHour] = useState('1');

  return (
    <div className="should-i-go">

      {/* Main split */}
      <div className="main-grid" style={{ flex: 1, minHeight: 0 }}>

        {/* Left panel */}
        <div className="card left-panel">
          <div>
            <p className="section-title">Where to?</p>
            <input
              className="input-field"
              type="text"
              placeholder="Enter your destination..."
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <p className="section-title">Current Conditions</p>
            <div className="weather-placeholder" style={{ flex: 1 }}>
              Weather &amp; Conditions Placeholder
            </div>
          </div>
        </div>

        {/* Right panel — map */}
        <div className="map-panel">
          <span>Interactive Map Placeholder</span>
        </div>
      </div>

      {/* Bottom email update bar */}
      <div className="card update-bar">
        <div className="update-bar-text">
          <h3>Stay Updated</h3>
          <p>Get traffic &amp; weather alerts for your route straight to your inbox.</p>
        </div>
        <div className="update-bar-controls">
          <input
            className="input-field"
            type="email"
            placeholder="Your email address"
            style={{ minWidth: 220 }}
          />
          <select
            className="select-field"
            value={updateHour}
            onChange={e => setUpdateHour(e.target.value)}
          >
            <option value="1">1 hour later</option>
            <option value="2">2 hours later</option>
            <option value="4">4 hours later</option>
          </select>
          <button className="btn-primary">Notify Me</button>
        </div>
      </div>
    </div>
  );
};

export default ShouldIGo;
