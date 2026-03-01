import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, WEATHER_METADATA_CACHE_TABLE } from './dynamodb.js';
import type { CachedItem, ServiceResult } from '../types/index.js';

interface WithCacheOptions<T> {
  pk: string;
  sk: string;
  ttlMinutes: number;
  label: string;
  fetch: () => Promise<T>;
}

export const withCache = async <T>(
  options: WithCacheOptions<T>,
): Promise<ServiceResult<T>> => {
  const { pk, sk, ttlMinutes, label, fetch } = options;
  const now = Date.now();

  const cachedResult = await dynamoDb.send(
    new GetCommand({
      TableName: WEATHER_METADATA_CACHE_TABLE,
      Key: { pk, sk },
    }),
  );

  if (cachedResult.Item) {
    const cached = cachedResult.Item as CachedItem<T>;
    const ageMinutes = (now - cached.timestamp) / 1000 / 60;

    if (ageMinutes < ttlMinutes) {
      console.log(`Cache HIT for ${label} - age: ${ageMinutes.toFixed(2)} min`);
      return {
        data: cached.data,
        cached: true,
        cachedAt: new Date(cached.timestamp).toISOString(),
      };
    }
  }

  console.log(`Cache MISS for ${label} - fetching from API`);
  const data = await fetch();

  const ttl = Math.floor(now / 1000) + ttlMinutes * 60;
  await dynamoDb.send(
    new PutCommand({
      TableName: WEATHER_METADATA_CACHE_TABLE,
      Item: { pk, sk, data, timestamp: now, ttl },
    }),
  );

  console.log(`Cached ${label}`);
  return { data, cached: false, fetchedAt: new Date(now).toISOString() };
};
