export interface TemperatureReading {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  temperature: number;
  readingUnit: string;
}

export interface TemperatureApiResponse {
  code: number;
  errorMsg: string;
  data: {
    readingUnit: string;
    stations: Array<{
      id: string;
      name: string;
      location: {
        latitude: number;
        longitude: number;
      };
    }>;
    readings: Array<{
      timestamp: string;
      data: Array<{
        stationId: string;
        value: number;
      }>;
    }>;
  };
}
