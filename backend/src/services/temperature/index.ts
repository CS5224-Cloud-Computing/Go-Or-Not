import { withCache } from '../../utils/cache.js';
import { API_URLS } from '../../config/api.js';
import type { ServiceResult } from '../../types/index.js';
import type { TemperatureReading, TemperatureApiResponse } from './types.js';

const CACHE_TTL_MINUTES = 15;
const CACHE_PK = 'TEMPERATURE';

export const getTemperatureByLocation = async (
  latitude: number,
  longitude: number,
): Promise<ServiceResult<TemperatureReading>> => {
  return withCache({
    pk: CACHE_PK,
    sk: `${latitude}#${longitude}`,
    ttlMinutes: CACHE_TTL_MINUTES,
    label: `temperature (${latitude}, ${longitude})`,
    fetch: async () => {
      const response = await fetch(API_URLS.airTemperature);
      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
      }

      const apiData = (await response.json()) as TemperatureApiResponse;
      if (apiData.code !== 0) {
        throw new Error(`API error: ${apiData.errorMsg}`);
      }

      const latestReading = apiData.data.readings[0];
      if (!latestReading) {
        throw new Error('No readings available from API');
      }

      type Station = TemperatureApiResponse['data']['stations'][number];
      type ReadingData =
        TemperatureApiResponse['data']['readings'][number]['data'][number];

      const station = apiData.data.stations.find(
        (s: Station) =>
          s.location.latitude === latitude &&
          s.location.longitude === longitude,
      );

      if (!station) {
        throw new StationNotFoundError(latitude, longitude);
      }

      const stationReading = latestReading.data.find(
        (r: ReadingData) => r.stationId === station.id,
      );

      if (!stationReading) {
        throw new Error(`No reading found for station ${station.id}`);
      }

      return {
        stationId: station.id,
        name: station.name,
        latitude: station.location.latitude,
        longitude: station.location.longitude,
        temperature: stationReading.value,
        readingUnit: apiData.data.readingUnit,
      };
    },
  });
};

export class StationNotFoundError extends Error {
  constructor(latitude: number, longitude: number) {
    super(`No station found at coordinates (${latitude}, ${longitude})`);
    this.name = 'StationNotFoundError';
  }
}
