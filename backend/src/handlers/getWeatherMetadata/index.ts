import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { jsonHeaders } from '../../utils/headers.js';
import {
  getHumidityByLocation,
  getTemperatureByLocation,
  getWindByLocation,
} from '../../services/temperature/index.js';
import { getPsiByLocation } from '../../services/psi/index.js';
import { getCurrentUvIndex } from '../../services/uv/index.js';
import { extractError } from '../../utils/utils.js';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const { latitude, longitude } = event.queryStringParameters ?? {};
  const parsedLatitude = parseFloat(latitude!);
  const parsedLongitude = parseFloat(longitude!);

  // TODO: handle different long lat values passed from orchestrator for temperature + humidity and wind
  try {
    const [temperatureResult, humidityResult, windResult, psiResult, uvResult] =
      await Promise.allSettled([
        getTemperatureByLocation(parsedLatitude, parsedLongitude),
        getHumidityByLocation(parsedLatitude, parsedLongitude),
        getWindByLocation(parsedLatitude, parsedLongitude),
        getPsiByLocation(parsedLatitude, parsedLongitude),
        getCurrentUvIndex(),
      ]);

    const temperature =
      temperatureResult.status === 'fulfilled' ? temperatureResult.value : null;
    const temperatureError = extractError(temperatureResult);

    const humidity =
      humidityResult.status === 'fulfilled' ? humidityResult.value : null;
    const humidityError = extractError(humidityResult);

    const wind = windResult.status === 'fulfilled' ? windResult.value : null;
    const windError = extractError(windResult);

    const psi = psiResult.status === 'fulfilled' ? psiResult.value : null;
    const psiError = extractError(psiResult);

    const uv = uvResult.status === 'fulfilled' ? uvResult.value : null;
    const uvError = extractError(uvResult);

    const errors: Record<string, string> = {};
    if (temperatureError) errors.temperature = temperatureError;
    if (humidityError) errors.humidity = humidityError;
    if (windError) errors.wind = windError;
    if (psiError) errors.psi = psiError;
    if (uvError) errors.uv = uvError;

    // If any data source failed, return 207 Multi-Status with errors and partial data
    if (Object.keys(errors).length > 0) {
      return {
        statusCode: 207,
        headers: jsonHeaders,
        body: JSON.stringify({
          errors,
          data: {
            temperature,
            humidity,
            wind,
            psi,
            uv,
          },
        }),
      };
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        temperature,
        humidity,
        wind,
        psi,
        uv,
      }),
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
