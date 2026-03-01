import { useState } from 'react';

const highways = [
  { label: 'Highway 101', id: 'h101' },
  { label: 'I-5 North', id: 'i5n' },
  { label: 'BQE', id: 'bqe' },
];

const Traffic = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="traffic-page">
      <h1 className="traffic-title">Live Traffic Feeds</h1>

      {/* Highway tabs */}
      <div className="tab-bar">
        {highways.map((hw, i) => (
          <button
            key={hw.id}
            className={`tab-btn ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {hw.label}
          </button>
        ))}
      </div>

      {/* Camera feed */}
      <div className="feed-panel">
        <div className="live-badge">
          <span className="live-dot" />
          LIVE
        </div>
        <p className="feed-label">{highways[activeTab].label}</p>
        <div className="feed-placeholder">
          Awaiting video stream connection...
        </div>
      </div>
    </div>
  );
};

export default Traffic;
