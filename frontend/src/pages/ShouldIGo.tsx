import { useState, useEffect } from 'react';
import CloudyIcon from '../assets/cloudy.svg';
import ThunderIcon from '../assets/thunder.svg';
import RainIcon from '../assets/rain.svg';
import SunnyIcon from '../assets/sunny.svg';
import BadIcon from '../assets/bad.svg';
import GoodIcon from '../assets/good.svg';
import MaybeIcon from '../assets/maybe.svg';
import type { ParkingResponse } from '../../../backend/src/services/carpark/types.ts';
import { API_BASE_URL } from '../config';
import { InfoTooltip } from '../components/InfoTooltip.tsx';
import { OverviewDetails } from '../components/OverviewDetails/index.tsx';
import type {
  RecommendationResponse,
  RecommendationTier,
} from '../types/recommendation.ts';

// FORMULA: Steadman's Formula for feels like temperature
// we assume here that relative humidity is given as a %, and wind is given in knots (i.e., 1 kn = 1.852km/h)
const calculateFeelsLike = (temp: number, humidity: number, wind: number) => {
  wind = (wind * 1.852 * 1000) / 3600; // converting kn to m/s
  const waterPressure =
    (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  return Math.round(temp + 0.33 * waterPressure - 0.7 * wind - 4.0);
};

// MAPPINGS: for colours, words and icons
const getUVStatus = (uv: number) => {
  if (uv <= 2) return { word: 'Low', color: '#2ecc71' }; // Green
  if (uv <= 5) return { word: 'Moderate', color: '#f1c40f' }; // Yellow
  if (uv <= 7) return { word: 'High', color: '#e67e22' }; // Orange
  if (uv <= 10) return { word: 'Very High', color: '#e74c3c' }; // Red
  return { word: 'Extreme', color: '#9b59b6' }; // Purple
};

const getPSIStatus = (psi: number) => {
  if (psi <= 50) return { word: 'Good', color: '#2ecc71' };
  if (psi <= 100) return { word: 'Moderate', color: '#f1c40f' };
  if (psi <= 200) return { word: 'Unhealthy', color: '#e67e22' };
  if (psi <= 300) return { word: 'Very Unhealthy', color: '#e74c3c' };
  return { word: 'Hazardous', color: '#9b59b6' };
};

const getWeatherIcon = (description: string) => {
  const desc = description.toLowerCase();
  if (desc.includes('thunder')) return ThunderIcon;
  if (desc.includes('rain') || desc.includes('shower') || desc.includes('mist'))
    return RainIcon;
  if (desc.includes('partly cloudy') || desc.includes('windy'))
    return CloudyIcon;
  if (desc.includes('fair')) return SunnyIcon;
  return CloudyIcon; // Cloudy, Hazy, Slightly Hazy, Fog
};

const overviewData = (
  recommendation: RecommendationTier | undefined,
  summary: string | undefined,
) => {
  if (recommendation === 'GO') {
    return {
      icon: GoodIcon,
      advice: 'Looking good!',
      desc: summary ?? "It's a beautiful day to head out!",
      color: '#008E9B',
      backgroundColor: 'rgba(0, 142, 155, 0.1)',
    };
  }

  if (recommendation === 'MAYBE') {
    return {
      icon: MaybeIcon,
      advice: 'Hmm...maybe?',
      desc: summary ?? "Conditions aren't the best right now.",
      color: '#CC7400',
      backgroundColor: 'rgba(204, 116, 0, 0.1)',
    };
  }

  if (recommendation === 'NO_GO') {
    return {
      icon: BadIcon,
      advice: 'Oh no!',
      desc: summary ?? 'Looks like it might not be the time...',
      color: '#C80000',
      backgroundColor: 'rgba(200, 0, 0, 0.1)',
    };
  }
};

type OneMapSuggestion = {
  ADDRESS: string;
  POSTAL: string;
  LATITUDE: string;
  LONGITUDE: string;
};

const toFriendlyNotificationError = (
  rawMessage: string | undefined,
): string => {
  if (!rawMessage) {
    return 'Could not subscribe. Please try again.';
  }

  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('email address is not verified') ||
    normalized.includes('identities failed the check')
  ) {
    return 'Email not approved. SES sandbox only sends to verified addresses.';
  }

  if (normalized.includes('valid email')) {
    return 'Please enter a valid email address.';
  }

  if (normalized.includes('destination') || normalized.includes('latitude')) {
    return 'Please choose a destination first.';
  }

  return 'Could not subscribe. Please try again.';
};

const ShouldIGo = () => {
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [coords, setCoords] = useState({ lat: '1.2839', lon: '103.8514' });
  const [updateHour, setUpdateHour] = useState('1');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [submittingNotification, setSubmittingNotification] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<OneMapSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedPostal, setSelectedPostal] = useState('');
  const [parkingMarkers, setParkingMarkers] = useState<string>('');

  // test out if this is still necessary
  const [weatherData, setWeatherData] = useState({
    temp: 29,
    humidity: 80,
    windSpeed: 3.3,
    desc: 'Fair',
    uvIndex: 10,
    psi: 55,
  });

  const [loading, setLoading] = useState(true);
  const [recommendationData, setRecommendationData] =
    useState<RecommendationResponse | null>(null);

  const fetchAllWeatherData = async (latitude: string, longitude: string) => {
    setLoading(true);
    try {
      const [weatherRes, metadataRes, recommendationRes] = await Promise.all([
        fetch(
          `${API_BASE_URL}/weather?latitude=${latitude}&longitude=${longitude}`,
        ),
        fetch(
          `${API_BASE_URL}/weather-metadata?latitude=${latitude}&longitude=${longitude}`,
        ),
        fetch(`${API_BASE_URL}/recommendation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: Number(latitude),
            longitude: Number(longitude),
          }),
        }),
      ]);

      if (!weatherRes.ok || !metadataRes.ok) {
        throw new Error('Failed to fetch from new APIs');
      }

      const weather2hr = await weatherRes.json();
      const metadata = await metadataRes.json();
      const metadataPayload = metadata.data ?? metadata;

      // update according to final schema
      setWeatherData({
        temp: metadataPayload.temperature?.data?.temperature ?? 29,
        humidity: metadataPayload.humidity?.data?.humidity ?? 80,
        windSpeed: metadataPayload.wind?.data?.windSpeed ?? 3.3,
        desc: weather2hr.data?.forecast ?? 'Fair',
        uvIndex: metadataPayload.uv?.data?.value ?? 10,
        psi: metadataPayload.psi?.data?.psiTwentyFourHourly ?? 55,
      });

      if (recommendationRes.ok) {
        const recommendation =
          (await recommendationRes.json()) as RecommendationResponse;
        setRecommendationData(recommendation);
      } else {
        setRecommendationData(null);
      }
    } catch {
      console.warn('Backend not ready, using mock data instead.');
      setWeatherData({
        temp: 29,
        humidity: 80,
        windSpeed: 3.3,
        desc: 'Fair',
        uvIndex: 10,
        psi: 55,
      });
      setRecommendationData(null);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  const fetchAllParkingData = async (latitude: string, longitude: string) => {
    setLoading(true);
    try {
      const parkingRes = await fetch(
        `http://localhost:3001/parking?latitude=${latitude}&longitude=${longitude}`,
      );

      if (!parkingRes.ok) {
        throw new Error('Failed to fetch from new APIs');
      }
      const rawData = await parkingRes.json();
      const parkingData: ParkingResponse[] = (rawData.parking || []).slice(
        0,
        5,
      );
      const markerStrings = await Promise.all(
        parkingData.map(async (cp: ParkingResponse) => {
          const html = getParkingHtml(
            cp.address,
            cp.type,
            cp.system,
            cp.total_lots,
            cp.lots_available,
          );
          const iwt = translateBase64(html);
          const color = cp.lots_available > 0 ? 'green' : 'black';
          let postal = '';
          try {
            const token =
              'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMTcxOCwiZm9yZXZlciI6ZmFsc2UsImlzcyI6Ik9uZU1hcCIsImlhdCI6MTc3NDc1NzY0OCwibmJmIjoxNzc0NzU3NjQ4LCJleHAiOjE3NzUwMTY4NDgsImp0aSI6IjA2YmY1MDNkLWZhYWQtNDViNS05YjFmLWU2ZWZkYTg2MTdjMyJ9.KlpXlmd6eZwKPmKthLv6NcXoQQkAmFj0yIauZJS7zERIZy7zZCjvGOIsOwoUHS_6JtkOEqtyQycMbAhpzUZBC-LPUCHhyr203a9owIgQKkLydVvdO8v39f46qmm_VDj25jEh15x9lGibe43apYu2F0W1D8zV22MCuShpCOyUtuyFRUD4OXC7Sjwd_7AVKtETbMEQDWs2bhoaPm6xFu_HOZvjDngg3sreDKNcNJCkAMR0-BMMwrFiYmGIAB_czCSIFzSYc4sAMdAgSZLxRcSEjGpYd7ldXJP8RSDCEhQSwUv19NsxDHqAER7CwOsz9cCpkenbLNKvlDiTwBInLEEz3Q';
            const res = await fetch(
              `https://www.onemap.gov.sg/api/public/revgeocodexy?location=${cp.x_coord}%2C${cp.y_coord}&buffer=40&addressType=All`,
              {
                method: 'GET',
                headers: {
                  Authorization: token,
                },
              },
            );
            if (!res.ok) {
              console.error(`Status: ${res.status}`);
              return null;
            }

            const data = await res.json();

            if (data.GeocodeInfo && data.GeocodeInfo.length > 0) {
              postal = data.GeocodeInfo[0].POSTALCODE;
              console.log('Found Postal:', postal);
            } else {
              postal = '550425';
              console.warn('No results found, using default.');
            }

            return `postalcode:${postal}!colour:${color}!iwt:${iwt}`;
          } catch (err) {
            console.error("Couldn't find car park:", err);
          }
        }),
      );

      const finalMarkerParam = markerStrings.join('&marker=');
      console.log(finalMarkerParam);
      setParkingMarkers(finalMarkerParam);
    } catch (err) {
      console.error('Failed to fetch parking:', err);
      console.warn('Backend not ready.');
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  const currentFeelsLike = calculateFeelsLike(
    weatherData.temp,
    weatherData.humidity,
    weatherData.windSpeed,
  );

  const weatherIcon = getWeatherIcon(weatherData.desc);
  const uvInfo = getUVStatus(weatherData.uvIndex);
  const psiInfo = getPSIStatus(weatherData.psi);
  const overviewInfo = overviewData(
    recommendationData?.recommendation,
    recommendationData?.summary,
  );

  useEffect(() => {
    fetchAllWeatherData(coords.lat, coords.lon);
  }, [coords.lat, coords.lon]);

  const handleSelectAddress = (item: OneMapSuggestion) => {
    setSuggestions([]);
    setShowDropdown(false);
    setIsSelecting(true);

    setQuery(item.ADDRESS);
    setSelectedPostal(item.POSTAL);
    setCoords({ lat: item.LATITUDE, lon: item.LONGITUDE });

    // Trigger the weather fetch using the new coords
    fetchAllWeatherData(item.LATITUDE, item.LONGITUDE);
    fetchAllParkingData(item.LATITUDE, item.LONGITUDE);
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
        const res = await fetch(
          `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y`,
        );
        const data = (await res.json()) as { results?: OneMapSuggestion[] };
        const filteredResults = (data.results || []).filter(
          (item) => item.POSTAL && item.POSTAL !== 'NIL',
        );
        if (
          filteredResults.length === 1 &&
          filteredResults[0].ADDRESS === query
        ) {
          setShowDropdown(false);
          setSuggestions([]);
        } else {
          setSuggestions(filteredResults);
          setShowDropdown(filteredResults.length > 0);
        }
      } catch (err) {
        console.error('Autocomplete error:', err);
        setShowDropdown(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, isSelecting]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const submitNotification = async () => {
    const email = notificationEmail.trim().toLowerCase();
    if (!email) {
      setToast({ message: 'Please enter your email address.', type: 'error' });
      return;
    }

    if (!selectedPostal) {
      setToast({
        message: 'Please search for and select a destination first.',
        type: 'error',
      });
      return;
    }

    const latitude = Number(coords.lat);
    const longitude = Number(coords.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setToast({
        message: 'Please select a valid destination first.',
        type: 'error',
      });
      return;
    }

    setSubmittingNotification(true);
    try {
      const response = await fetch(`${API_BASE_URL}/notifications/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          postalCode: selectedPostal || undefined,
          latitude,
          longitude,
          notifyAfterHours: Number(updateHour),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setToast({
          message: toFriendlyNotificationError(payload.error),
          type: 'error',
        });
        return;
      }

      setToast({
        message: 'Saved. Check your approved inbox for updates.',
        type: 'success',
      });
    } catch {
      setToast({
        message: 'Unable to reach notification service. Please try again.',
        type: 'error',
      });
    } finally {
      setSubmittingNotification(false);
    }
  };

  if (loading && isInitialLoad) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '400px',
          color: '#888',
        }}
      >
        <div className='spinner'></div>
        <p style={{ marginTop: '10px' }}>Syncing with NEA sensors...</p>
      </div>
    );
  }

  const getParkingHtml = (
    address: string,
    type: string,
    system: string,
    total_lots: number,
    lots_available: number,
  ) => {
    const html = `<p>Car Park Address: ${address}</p><p>Car Park Type: ${type}</p><p>Parking System: ${system}</p><p>Lots Available: ${lots_available}</p><p>Total Lots: ${total_lots}</p>`;
    return html;
  };

  const translateBase64 = (html: string) => {
    const encodedHtml = encodeURIComponent(html);
    return btoa(encodedHtml);
  };

  return (
    <div className='should-i-go'>
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className='toast-icon'>
            {toast.type === 'success' ? '✓' : '!'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main split */}
      <div className='main-grid' style={{ flex: 1, minHeight: 0 }}>
        {/* Left panel */}
        <div className='card left-panel'>
          <div>
            <p className='section-title'>Where to?</p>
            <input
              className='input-field'
              type='text'
              value={query}
              placeholder='Enter your destination'
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ddd',
              }}
            />

            {showDropdown && suggestions.length > 0 && (
              <ul
                className='suggestions-dropdown'
                style={{
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
                  overflowY: 'auto',
                }}
              >
                {suggestions.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => handleSelectAddress(item)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      fontSize: '0.9rem',
                      color: '#333',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = '#f8f9fa')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = 'transparent')
                    }
                  >
                    {item.ADDRESS}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Current Conditions */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            <p className='section-title'>Current Conditions</p>

            <div
              className='weather-placeholder'
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '30px',
                height: '100%',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  columnGap: '16px',
                  rowGap: '8px',
                  width: '100%',
                  flexDirection: 'row',
                }}
              >
                {/* Icon & Temp Group */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <div>
                    {' '}
                    <img
                      src={weatherIcon}
                      alt='Weather Icon'
                      style={{ height: '3.5em', width: 'auto' }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: '3rem',
                      fontWeight: 'bold',
                      color: '#524e4e',
                    }}
                  >
                    {weatherData.temp}°C
                  </div>
                </div>

                {/* Description & Feels Like Group */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: '1',
                    minWidth: '100px',
                    gap: '3px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                      whiteSpace: 'normal',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 'bold',
                        fontSize: '1.1rem',
                        lineHeight: '1.2',
                        color: '#524e4e',
                      }}
                    >
                      {weatherData.desc}
                    </span>
                    <InfoTooltip text='A 2-hour Weather Forecast' />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', color: '#524e4e' }}>
                      Feels like {currentFeelsLike}°C
                    </span>
                    <InfoTooltip
                      text='Calculated based on temperature, humidity, and wind
                        speed using Steadman Apparent Temperature formula.'
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '10px',
                width: '100%',
                flexWrap: 'wrap',
              }}
            >
              {/* UV Index */}
              <div
                className='weather-placeholder'
                style={{
                  display: 'flex',
                  flex: 1,
                  justifyContent: 'center',
                  paddingTop: '20px',
                  paddingBottom: '20px',
                  height: '100%',
                  marginBottom: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    width: '100%',
                  }}
                >
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <p style={{ fontSize: '0.8rem', color: '#524e4e' }}>
                        UV INDEX
                      </p>
                      <InfoTooltip
                        text='Measures how intense the Ultra Violet (UV) rays from
                          the Sun are predicted to be.'
                      />
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        width: '100px',
                        margin: '0 auto',
                      }}
                    >
                      {/* The SVG Arc */}
                      <svg width='100' height='60' viewBox='0 0 100 60'>
                        {/* Background Gray Track */}
                        <path
                          d='M 10 50 A 40 40 0 0 1 90 50'
                          fill='none'
                          stroke='#eee'
                          strokeWidth='8'
                          strokeLinecap='round'
                        />
                        {/* Colored Progress Arc */}
                        <path
                          d='M 10 50 A 40 40 0 0 1 90 50'
                          fill='none'
                          stroke={uvInfo.color}
                          strokeWidth='8'
                          strokeLinecap='round'
                          strokeDasharray='125.6'
                          /* This math calculates how much of the arc to fill based on a scale of 1-12 */
                          strokeDashoffset={
                            125.6 -
                            (125.6 * Math.min(weatherData.uvIndex, 12)) / 12
                          }
                          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                        />
                      </svg>

                      {/* The Number in the center */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '25px',
                          left: '0',
                          right: '0',
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          color: uvInfo.color,
                        }}
                      >
                        {weatherData.uvIndex}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        color: uvInfo.color,
                        marginTop: '5px',
                      }}
                    >
                      {uvInfo.word}
                    </div>
                  </div>
                </div>
              </div>

              {/* PSI */}
              <div
                className='weather-placeholder'
                style={{
                  display: 'flex',
                  flex: 1,
                  justifyContent: 'center',
                  paddingTop: '20px',
                  paddingBottom: '20px',
                  height: '100%',
                }}
              >
                <div
                  style={{ textAlign: 'center', flex: 1, alignItems: 'center' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <p style={{ fontSize: '0.8rem', color: '#524e4e' }}>PSI</p>
                    <InfoTooltip
                      text='Pollutant Standards Index: Measures air quality, taking
                        into account several pollutants.'
                    />
                  </div>
                  {/* Arc will go here */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100px',
                      margin: '0 auto',
                    }}
                  >
                    <svg width='100' height='60' viewBox='0 0 100 60'>
                      <path
                        d='M 10 50 A 40 40 0 0 1 90 50'
                        fill='none'
                        stroke='#eee'
                        strokeWidth='8'
                        strokeLinecap='round'
                      />
                      <path
                        d='M 10 50 A 40 40 0 0 1 90 50'
                        fill='none'
                        stroke={psiInfo.color}
                        strokeWidth='8'
                        strokeLinecap='round'
                        strokeDasharray='125.6'
                        /* PSI scale up to 300 */
                        strokeDashoffset={
                          125.6 - (125.6 * Math.min(weatherData.psi, 300)) / 300
                        }
                        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        top: '25px',
                        left: '0',
                        right: '0',
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        color: psiInfo.color,
                      }}
                    >
                      {weatherData.psi}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      color: psiInfo.color,
                      marginTop: '5px',
                    }}
                  >
                    {psiInfo.word}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Overview */}
          <div
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <div style={{ display: 'flex' }}>
              <p className='section-title'>Overview</p>
              {recommendationData ? (
                <OverviewDetails recommendationData={recommendationData} />
              ) : null}
            </div>
            {recommendationData ? (
              <div
                className='overview-placeholder'
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  justifyContent: 'left',
                  alignItems: 'left',
                  color: '#524e4e',
                  outline: `2px solid ${overviewInfo?.color}`,
                  backgroundColor: overviewInfo?.backgroundColor,
                  borderRadius: '12px',
                  padding: '15px',
                  textAlign: 'left',
                }}
              >
                <div style={{ marginLeft: '20px' }}>
                  {' '}
                  <img
                    src={overviewInfo?.icon}
                    alt='Overview Icon'
                    style={{
                      height: '2em',
                      width: 'auto',
                      marginRight: '15px',
                      marginTop: '5px',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      color: overviewInfo?.color,
                    }}
                  >
                    {overviewInfo?.advice}
                  </span>
                  <span
                    style={{ fontSize: '0.9rem', color: overviewInfo?.color }}
                  >
                    {overviewInfo?.desc}
                  </span>
                </div>
              </div>
            ) : (
              <i style={{ opacity: 0.5, fontSize: '14px' }}>Loading...</i>
            )}
          </div>
        </div>

        {/* Right panel — map */}
        {/* 'PHA+WW91ciBEZXN0aW5hdGlvbiE8L3A+' iwt is the Base64 encoding of <p>Your Destination!</p>, which is the default pop-up text for destination on the map*/}
        <div
          className='map-panel'
          style={{
            height: '100%',
            minHeight: '300px',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid #eee',
          }}
        >
          <iframe
            key={selectedPostal}
            src={`https://www.onemap.gov.sg/amm/amm.html?mapStyle=Default&zoomLevel=15&marker=postalcode:${selectedPostal}!colour:red!iwt:PHA+WW91ciBEZXN0aW5hdGlvbiE8L3A+&marker=${parkingMarkers}`}
            height='100%'
            width='100%'
            scrolling='no'
            frameBorder='0'
            allowFullScreen
          />
        </div>
      </div>

      {/* Bottom email update bar */}
      <div className='card update-bar'>
        <div className='update-bar-text' style={{ flex: 1 }}>
          <h3>STAY UPDATED</h3>
          <p>
            Get traffic &amp; weather alerts for your route straight to your
            inbox.
          </p>
        </div>
        <div className='email-placeholder'>
          <input
            className='input-field'
            type='email'
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder='Enter your email address'
            style={{ minWidth: 400 }}
          />
        </div>
        <div className='update-bar-controls'>
          <select
            className='select-field'
            value={updateHour}
            onChange={(e) => setUpdateHour(e.target.value)}
          >
            <option value='1'>1 hour later</option>
            <option value='2'>2 hours later</option>
            <option value='4'>4 hours later</option>
            <option value='8'>8 hours later</option>
          </select>
          <button
            className='btn-primary'
            onClick={submitNotification}
            disabled={submittingNotification}
          >
            {submittingNotification ? 'Submitting...' : 'Notify Me'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShouldIGo;
