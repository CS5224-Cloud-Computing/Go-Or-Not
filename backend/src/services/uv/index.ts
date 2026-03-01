import dayjs from 'dayjs';
import { withCache } from '../../utils/cache.js';
import { API_URLS } from '../../config/api.js';
import type { ServiceResult } from '../../types/index.js';
import type { UvReading, UvApiResponse } from './types.js';

const CACHE_TTL_MINUTES = 60; // UV index is updated hourly
const CACHE_PK = 'UV';
const CACHE_SK = 'LATEST';

const findClosestReading = (
  index: UvApiResponse['data']['records'][number]['index'],
): UvReading => {
  const now = dayjs();

  let closest = index[0]!;
  let smallestDiff = Math.abs(now.diff(dayjs(closest.hour)));

  for (const entry of index) {
    const diff = Math.abs(now.diff(dayjs(entry.hour)));
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = entry;
    }
  }

  return { hour: closest.hour, value: closest.value };
};

export const getCurrentUvIndex = async (): Promise<
  ServiceResult<UvReading>
> => {
  return withCache({
    pk: CACHE_PK,
    sk: CACHE_SK,
    ttlMinutes: CACHE_TTL_MINUTES,
    label: 'UV index',
    fetch: async () => {
      const response = await fetch(API_URLS.uv);
      if (!response.ok) {
        throw new Error(
          `UV API returned ${response.status}: ${response.statusText}`,
        );
      }

      const apiData = (await response.json()) as UvApiResponse;
      if (apiData.code !== 0) {
        throw new Error(`UV API error: ${apiData.errorMsg}`);
      }

      const latestRecord = apiData.data.records[0];
      if (!latestRecord || latestRecord.index.length === 0) {
        throw new Error('No UV index readings available from API');
      }

      return findClosestReading(latestRecord.index);
    },
  });
};
