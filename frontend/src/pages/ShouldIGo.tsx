import { useState, useEffect } from 'react';

// FORMULA: Steadman's Formula for feels like temperature
// we assume here that relative humidity is given as a %, and wind is given in knots (i.e., 1 kn = 1.852km/h)
const calculateFeelsLike = (temp: number, humidity: number, wind: number) => {
  wind = wind * 1.852 * 1000 / 3600; // converting kn to m/s
  const waterPressure = humidity / 100 * 6.105 * Math.exp(17.27 * temp / (237.7 + temp));
  return Math.round(temp + 0.33 * waterPressure - 0.7 * wind - 4.00);
};

// MAPPINGS: for colours, words and icons
const getUVStatus = (uv: number) => {
  if (uv <= 2) return { word: "Low", color: "#2ecc71" }; // Green
  if (uv <= 5) return { word: "Moderate", color: "#f1c40f" }; // Yellow
  if (uv <= 7) return { word: "High", color: "#e67e22" }; // Orange
  if (uv <= 10) return { word: "Very High", color: "#e74c3c" }; // Red
  return { word: "Extreme", color: "#9b59b6" }; // Purple
};

const getPSIStatus = (psi: number) => {
  if (psi <= 50) return { word: "Good", color: "#2ecc71" };
  if (psi <= 100) return { word: "Moderate", color: "#f1c40f" };
  if (psi <= 200) return { word: "Unhealthy", color: "#e67e22" };
  if (psi <= 300) return { word: "Very Unhealthy", color: "#e74c3c" };
  return { word: "Hazardous", color: "#9b59b6" };
};

const getWeatherIcon = (description: string) => {
  const desc = description.toLowerCase();
  if (desc.includes("thunder")) return "⛈️";
  if (desc.includes("rain") || desc.includes("shower") || desc.includes("mist")) return "🌧️";
  if (desc.includes("partly cloudy") || desc.includes("windy")) return "🌤️";
  if (desc.includes("fair")) return "☀️";
  return "☁️"; // Cloudy, Hazy, Slightly Hazy, Fog
};

const ShouldIGo = () => {
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [coords, setCoords] = useState({ lat: "1.3521", lon: "103.8198" });
  const [updateHour, setUpdateHour] = useState('1')
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedPostal, setSelectedPostal] = useState("");

  // test out if this is still necessary
  const [weatherData, setWeatherData] = useState({
    temp: 29,
    humidity: 80,
    windSpeed: 3.3,
    desc: "Cloudy",
    uvIndex: 10,
    psi: 55
  });

  const [loading, setLoading] = useState(true);

  const fetchAllWeatherData = async (latitude: string, longitude: string) => {
    setLoading(true);
    try {
      const basePayload = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      };
      // update URL
      const postRequest = (type: string) =>
        fetch('http://localhost:5000/api/weather-gateway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...basePayload, type })
        }).then(res => res.json());

      const [weather2hr, metadata] = await Promise.all([
        postRequest('weather'),
        postRequest('metadata')
      ]);
      // update according to final schema
      setWeatherData({
        temp: metadata.temp,
        humidity: metadata.humidity,
        windSpeed: metadata.windSpeed,
        desc: weather2hr.forecast,
        uvIndex: metadata.uvIndex,
        psi: metadata.psi,
      });

    } catch (error) {
      // console.error("Failed to fetch weather:", error);
      console.warn("Backend not ready, using mock data instead.");
      setWeatherData({
        temp: 29,
        humidity: 80,
        windSpeed: 3.3,
        desc: "Cloudy",
        uvIndex: 10,
        psi: 55
      });
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  const currentFeelsLike = calculateFeelsLike(
    weatherData.temp,
    weatherData.humidity,
    weatherData.windSpeed
  );

  const weatherIcon = getWeatherIcon(weatherData.desc);
  const uvInfo = getUVStatus(weatherData.uvIndex);
  const psiInfo = getPSIStatus(weatherData.psi);

  useEffect(() => {
    fetchAllWeatherData(coords.lat, coords.lon);
  }, []);

  const handleSelectAddress = (item: any) => {
    setSuggestions([]);
    setShowDropdown(false);
    setIsSelecting(true);

    setQuery(item.ADDRESS);
    setSelectedPostal(item.POSTAL);
    setCoords({ lat: item.LATITUDE, lon: item.LONGITUDE });

    // Trigger the weather fetch using the new coords
    fetchAllWeatherData(item.LATITUDE, item.LONGITUDE);
  };

  useEffect(() => {
    if (isSelecting) {
      setIsSelecting(false);
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (query.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y`);
        const data = await res.json();
        const filteredResults = (data.results || []).filter((item: any) =>
          item.POSTAL && item.POSTAL !== "NIL"
        );
        if (filteredResults.length === 1 && filteredResults[0].ADDRESS === query) {
          setShowDropdown(false);
          setSuggestions([]);
        } else {
          setSuggestions(filteredResults);
          setShowDropdown(filteredResults.length > 0);
        }

      } catch (err) {
        console.error("Autocomplete error:", err);
        setShowDropdown(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  if (loading && isInitialLoad) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px',
        color: '#888'
      }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '10px' }}>Syncing with NEA sensors...</p>
      </div>
    );
  }

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
              value={query}
              placeholder="Enter your destination"
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
            />

            {showDropdown && suggestions.length > 0 && (
              <ul className="suggestions-dropdown" style={{
                position: 'absolute',
                zIndex: 100,
                background: 'white',
                border: '1px solid #ccc',
                borderRadius: '0 0 8px 8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                listStyle: 'none',
                padding: 0,
                margin: 0,
                maxHeight: '250px',
                overflowY: 'auto'
              }}>
                {suggestions.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => handleSelectAddress(item)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      fontSize: '0.9rem',
                      color: '#333'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {item.ADDRESS}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <p className="section-title">Current Conditions</p>
            <div className="weather-placeholder" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px', height: '100%' }}>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                columnGap: '16px',
                rowGap: '8px',
                width: '100%',
                flexDirection: 'row'
              }}>

                {/* Icon & Temp Group */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '3.3rem' }}>{weatherIcon}</div>
                  <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{weatherData.temp}°C</div>
                </div>

                {/* Description & Feels Like Group */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: '1', minWidth: '100px', gap: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem', lineHeight: '1.2' }}>{weatherData.desc}</span>
                    <span style={{ cursor: 'help', fontSize: '0.85rem', color: '#666' }} title="A 2-hour Weather Forecast">ⓘ</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>Feels like {currentFeelsLike}°C</span>
                    <span style={{ cursor: 'help', fontSize: '0.85rem', color: '#666' }} title="Calculated based on temperature, humidity, and wind speed using Steadman Apparent Temperature formula.">ⓘ</span>
                  </div>
                </div>

              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', width: '100%', marginTop: '15px' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                    <p style={{ fontSize: '0.8rem', color: '#888' }}>UV INDEX</p>
                    <p style={{ cursor: 'help', fontSize: '0.8rem', color: '#888' }} title="Measures how intense the Ultra Violet (UV) rays from the Sun are predicted to be.">ⓘ</p>
                  </div>
                  <div style={{ position: 'relative', width: '100px', margin: '0 auto' }}>
                    {/* The SVG Arc */}
                    <svg width="100" height="60" viewBox="0 0 100 60">
                      {/* Background Gray Track */}
                      <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="#eee"
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                      {/* Colored Progress Arc */}
                      <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={uvInfo.color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray="125.6"
                        /* This math calculates how much of the arc to fill based on a scale of 1-12 */
                        strokeDashoffset={125.6 - (125.6 * Math.min(weatherData.uvIndex, 12)) / 12}
                        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                      />
                    </svg>

                    {/* The Number in the center */}
                    <div style={{
                      position: 'absolute',
                      top: '25px',
                      left: '0',
                      right: '0',
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      color: uvInfo.color
                    }}>
                      {weatherData.uvIndex}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: uvInfo.color, marginTop: '5px' }}>
                    {uvInfo.word}
                  </div>
                </div>

                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                    <p style={{ fontSize: '0.8rem', color: '#888' }}>PSI</p>
                    <p style={{ cursor: 'help', fontSize: '0.8rem', color: '#888' }} title="Pollutant Standards Index: Measures air quality, taking into account several pollutants.">ⓘ</p>
                  </div>
                  {/* Arc will go here */}
                  <div style={{ position: 'relative', width: '100px', margin: '0 auto' }}>
                    <svg width="100" height="60" viewBox="0 0 100 60">
                      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#eee" strokeWidth="8" strokeLinecap="round" />
                      <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={psiInfo.color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray="125.6"
                        /* PSI scale up to 300 */
                        strokeDashoffset={125.6 - (125.6 * Math.min(weatherData.psi, 300)) / 300}
                        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', top: '25px', left: '0', right: '0', fontSize: '1.2rem', fontWeight: 'bold', color: psiInfo.color }}>
                      {weatherData.psi}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: psiInfo.color, marginTop: '5px' }}>
                    {psiInfo.word}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — map */}
        <div className="map-panel" style={{ height: '100%', minHeight: '300px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
          <iframe
            key={selectedPostal}
            src={`https://www.onemap.gov.sg/amm/amm.html?mapStyle=Default&zoomLevel=15&marker=postalcode:${selectedPostal}!colour:red`}
            height="100%"
            width="100%"
            scrolling="no"
            frameBorder="0"
            allowFullScreen
          />
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
    </div >
  );
};

export default ShouldIGo;
