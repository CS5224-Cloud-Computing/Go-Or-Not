import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const isLocal = process.env.NODE_ENV === 'dev' || process.env.IS_OFFLINE;

const client = new DynamoDBClient(
  isLocal
    ? {
        region: 'localhost',
        endpoint: 'http://localhost:8000',
        credentials: {
          accessKeyId: 'MockAccessKeyId',
          secretAccessKey: 'MockSecretAccessKey',
        },
      }
    : { region: process.env.AWS_REGION ?? 'ap-southeast-1' },
);

export const dynamoDb = DynamoDBDocumentClient.from(client);

export const TABLE_NAME = process.env.TABLE_NAME || 'go-or-not-dev';
export const WEATHER_METADATA_CACHE_TABLE = 'weather-metadata-cache-dev';
