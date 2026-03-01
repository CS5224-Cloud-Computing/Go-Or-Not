const BASE_URL = 'https://api-open.data.gov.sg/v2/real-time/api';

export const API_URLS = {
  airTemperature: `${BASE_URL}/air-temperature`,
  psi: `${BASE_URL}/psi`,
  uv: `${BASE_URL}/uv`,
} as const;
