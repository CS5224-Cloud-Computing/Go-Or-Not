import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  dynamoDb,
  WEATHER_METADATA_CACHE_TABLE,
} from '../../utils/dynamodb.js';
import { withCache } from '../../utils/cache.js';
import { API_URLS } from '../../config/api.js';
import type { ServiceResult } from '../../types/index.js';
import type { PsiReading, PsiApiResponse, Region } from './types.js';
import { REGIONS } from './types.js';

const CACHE_TTL_MINUTES = 15;
const CACHE_PK = 'PSI';

export class RegionNotFoundError extends Error {
  constructor(region: string) {
    super(`No PSI data found for region: ${region}`);
    this.name = 'RegionNotFoundError';
  }
}

const fetchPsiFromApi = async (): Promise<PsiApiResponse> => {
  const response = await fetch(API_URLS.psi);
  if (!response.ok) {
    throw new Error(
      `PSI API returned ${response.status}: ${response.statusText}`,
    );
  }

  const apiData = (await response.json()) as PsiApiResponse;
  if (apiData.code !== 0) {
    throw new Error(`PSI API error: ${apiData.errorMsg}`);
  }

  const latestItem = apiData.data.items[0];
  if (!latestItem) {
    throw new Error('No PSI readings available from API');
  }

  return apiData;
};

const buildReading = (
  region: Region,
  regionMeta: PsiApiResponse['data']['regionMetadata'][number],
  item: PsiApiResponse['data']['items'][number],
): PsiReading => {
  const { readings } = item;
  return {
    region,
    labelLocation: regionMeta.labelLocation,
    timestamp: item.timestamp,
    psiTwentyFourHourly: readings.psi_twenty_four_hourly[region],
    pm25TwentyFourHourly: readings.pm25_twenty_four_hourly[region],
    pm10TwentyFourHourly: readings.pm10_twenty_four_hourly[region],
    pm25SubIndex: readings.pm25_sub_index[region],
    pm10SubIndex: readings.pm10_sub_index[region],
    o3SubIndex: readings.o3_sub_index[region],
    o3EightHourMax: readings.o3_eight_hour_max[region],
    no2OneHourMax: readings.no2_one_hour_max[region],
    so2SubIndex: readings.so2_sub_index[region],
    so2TwentyFourHourly: readings.so2_twenty_four_hourly[region],
    coSubIndex: readings.co_sub_index[region],
    coEightHourMax: readings.co_eight_hour_max[region],
  };
};

export const getPsiByRegion = async (
  region: Region,
): Promise<ServiceResult<PsiReading>> => {
  return withCache({
    pk: CACHE_PK,
    sk: region,
    ttlMinutes: CACHE_TTL_MINUTES,
    label: `PSI region "${region}"`,
    fetch: async () => {
      const apiData = await fetchPsiFromApi();
      const latestItem = apiData.data.items[0]!;

      const regionMeta = apiData.data.regionMetadata.find(
        (r) => r.name === region,
      );
      if (!regionMeta) {
        throw new RegionNotFoundError(region);
      }

      return buildReading(region, regionMeta, latestItem);
    },
  });
};

export const getAllPsiRegions = async (): Promise<
  ServiceResult<PsiReading[]>
> => {
  const now = Date.now();

  // Check if all regions are cached
  const cachedResults = await Promise.all(
    REGIONS.map((r) =>
      dynamoDb.send(
        new GetCommand({
          TableName: WEATHER_METADATA_CACHE_TABLE,
          Key: { pk: CACHE_PK, sk: r },
        }),
      ),
    ),
  );

  type CachedRow = {
    pk: string;
    sk: string;
    data: PsiReading;
    timestamp: number;
    ttl: number;
  };

  const allFresh = cachedResults.every((result) => {
    if (!result.Item) return false;
    const age = (now - (result.Item as CachedRow).timestamp) / 1000 / 60;
    return age < CACHE_TTL_MINUTES;
  });

  if (allFresh) {
    console.log('Cache HIT for all PSI regions');
    const first = cachedResults[0]!.Item as CachedRow;
    return {
      data: cachedResults.map((r) => (r.Item as CachedRow).data),
      cached: true,
      cachedAt: new Date(first.timestamp).toISOString(),
    };
  }

  // Single API call, cache all regions
  console.log('Cache MISS for all PSI regions - fetching from API');
  const apiData = await fetchPsiFromApi();
  const latestItem = apiData.data.items[0]!;

  const ttl = Math.floor(now / 1000) + CACHE_TTL_MINUTES * 60;

  const allReadings = await Promise.all(
    apiData.data.regionMetadata.map(async (regionMeta) => {
      const r = regionMeta.name;
      const reading = buildReading(r, regionMeta, latestItem);
      await dynamoDb.send(
        new PutCommand({
          TableName: WEATHER_METADATA_CACHE_TABLE,
          Item: { pk: CACHE_PK, sk: r, data: reading, timestamp: now, ttl },
        }),
      );
      return reading;
    }),
  );

  console.log('Cached all PSI regions');
  return {
    data: allReadings,
    cached: false,
    fetchedAt: new Date(now).toISOString(),
  };
};
