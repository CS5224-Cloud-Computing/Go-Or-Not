import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { jsonHeaders } from '../../utils/headers.js';
import {
  getTemperatureByLocation,
  StationNotFoundError,
} from '../../services/temperature/index.js';
import {
  getPsiByRegion,
  RegionNotFoundError,
} from '../../services/psi/index.js';
import type { Region } from '../../services/psi/types.js';
import { getCurrentUvIndex } from '../../services/uv/index.js';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const { latitude, longitude, region } = event.queryStringParameters ?? {};
  const parsedLatitude = parseFloat(latitude!);
  const parsedLongitude = parseFloat(longitude!);

  try {
    const [temperatureResult, psiResult, uvResult] = await Promise.allSettled([
      getTemperatureByLocation(parsedLatitude, parsedLongitude),
      region ? getPsiByRegion(region as Region) : Promise.resolve(null),
      getCurrentUvIndex(),
    ]);

    const temperature =
      temperatureResult.status === 'fulfilled' ? temperatureResult.value : null;
    const psi = psiResult.status === 'fulfilled' ? psiResult.value : null;
    const uv = uvResult.status === 'fulfilled' ? uvResult.value : null;

    if (temperatureResult.status === 'rejected') {
      const err = temperatureResult.reason;
      if (err instanceof StationNotFoundError) {
        return {
          statusCode: 404,
          headers: jsonHeaders,
          body: JSON.stringify({ error: err.message }),
        };
      }
      throw err;
    }

    if (psiResult.status === 'rejected') {
      const err = psiResult.reason;
      if (err instanceof RegionNotFoundError) {
        return {
          statusCode: 404,
          headers: jsonHeaders,
          body: JSON.stringify({ error: err.message }),
        };
      }
      throw err;
    }

    if (uvResult.status === 'rejected') {
      throw uvResult.reason;
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ temperature, psi, uv }),
    };
  } catch (err) {
    console.error('Unexpected error in getWeatherMetadata handler:', err);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
