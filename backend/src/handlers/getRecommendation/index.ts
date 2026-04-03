import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import dayjs from 'dayjs';
import { jsonHeaders } from '../../utils/headers.js';

type RecommendationRequest = {
  postalCode?: string;
  latitude?: number;
  longitude?: number;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type LambdaProxyLikeResponse = {
  statusCode?: number;
  body?: string;
};

type WeatherMetadataEnvelope = {
  data?: {
    temperature?: { data?: { temperature?: number } };
    psi?: { data?: { psiTwentyFourHourly?: number } };
    uv?: { data?: { value?: number } };
  };
  temperature?: { data?: { temperature?: number } };
  psi?: { data?: { psiTwentyFourHourly?: number } };
  uv?: { data?: { value?: number } };
};

const SINGAPORE_MONTHLY_HIGH_C = [
  30.0, 31.1, 31.7, 31.7, 31.7, 31.1, 31.1, 31.1, 31.1, 31.1, 30.6, 30.0,
] as const;

const SINGAPORE_MONTHLY_LOW_C = [
  25.0, 25.0, 25.6, 26.1, 26.1, 26.1, 26.1, 26.1, 25.6, 25.6, 25.0, 25.0,
] as const;

const getLambdaClient = (event: APIGatewayProxyEvent): LambdaClient => {
  const host = (
    event.headers?.host ?? event.headers?.Host ?? ''
  ).toLowerCase();
  const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');

  if (isLocalHost) {
    return new LambdaClient({
      region: 'localhost',
      endpoint: 'http://localhost:3003',
      credentials: {
        accessKeyId: 'MockAccessKeyId',
        secretAccessKey: 'MockSecretAccessKey',
      },
    });
  }

  return new LambdaClient({
    region: process.env.AWS_REGION ?? 'ap-southeast-1',
  });
};

const WEATHER_METADATA_FUNCTION_NAME =
  process.env.WEATHER_METADATA_FUNCTION_NAME ?? '';
const WEATHER_2HR_FUNCTION_NAME = process.env.WEATHER_2HR_FUNCTION_NAME ?? '';
const CARPARK_FUNCTION_NAME = process.env.CARPARK_FUNCTION_NAME ?? '';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

const decodePayload = (payload: Uint8Array | undefined): string => {
  if (!payload) {
    return '{}';
  }
  return new TextDecoder().decode(payload);
};

const invokeLambda = async (
  lambdaClient: LambdaClient,
  functionName: string,
  payload: Record<string, unknown>,
): Promise<unknown> => {
  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
    }),
  );

  if (response.FunctionError) {
    throw new Error(
      `Invocation failed for ${functionName}: ${response.FunctionError}`,
    );
  }

  const parsed = JSON.parse(
    decodePayload(response.Payload),
  ) as LambdaProxyLikeResponse;
  const statusCode = parsed.statusCode ?? 500;

  if (statusCode >= 400) {
    throw new Error(
      `Invocation returned ${statusCode} for ${functionName}: ${parsed.body ?? ''}`,
    );
  }

  return parsed.body ? (JSON.parse(parsed.body) as unknown) : {};
};

const getCoordinatesFromPostalCode = async (
  postalCode: string,
): Promise<Coordinates | null> => {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('address', postalCode);
  endpoint.searchParams.set('region', 'sg');
  endpoint.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Geocode API returned ${response.status}`);
  }

  const body = (await response.json()) as {
    results?: Array<{
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
    status?: string;
  };

  const first = body.results?.[0]?.geometry?.location;
  if (!first?.lat || !first?.lng) {
    return null;
  }

  return { latitude: first.lat, longitude: first.lng };
};

const scoreWeather = (forecastText: string): number => {
  const text = forecastText.toLowerCase();

  if (text.includes('thunder') || text.includes('storm')) return 0.1;
  if (text.includes('rain') || text.includes('showers')) return 0.35;
  if (text.includes('cloudy') || text.includes('overcast')) return 0.8;
  if (text.includes('fair') || text.includes('sunny')) return 0.9;

  return 0.55;
};

const getSingaporeNow = (): dayjs.Dayjs => {
  const singaporeNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }),
  );
  return dayjs(singaporeNow);
};

const getSingaporeHour = (singaporeNow: dayjs.Dayjs): number => {
  const singaporeHour = singaporeNow.hour();
  return singaporeHour >= 0 && singaporeHour <= 23 ? singaporeHour : 12;
};

const getSingaporeMonthIndex = (singaporeNow: dayjs.Dayjs): number => {
  const monthIndex = singaporeNow.month();
  return monthIndex >= 0 && monthIndex <= 11 ? monthIndex : 0;
};

const estimateMonthlyBaselineTemperature = (
  monthIndex: number,
  hour: number,
): number => {
  const high = SINGAPORE_MONTHLY_HIGH_C[monthIndex] ?? 31;
  const low = SINGAPORE_MONTHLY_LOW_C[monthIndex] ?? 25.5;
  const dayMid = (high + low) / 2;

  if (hour >= 5 && hour <= 7) {
    return low;
  }

  if (hour > 7 && hour <= 13) {
    const progress = (hour - 7) / (13 - 7);
    return low + (high - low) * progress;
  }

  if (hour > 13 && hour < 20) {
    const progress = (hour - 13) / (20 - 13);
    return high - (high - dayMid) * progress;
  }

  if (hour >= 20) {
    const progress = (hour - 20) / (24 - 20);
    return dayMid - (dayMid - low) * progress;
  }

  const progress = hour / 5;
  return low + (dayMid - low) * progress;
};

const scoreTemperature = (
  temperature: number | undefined,
  baselineTemperature: number,
): number => {
  if (temperature == null) {
    return 0.55;
  }

  const idealTemperature = baselineTemperature - 0.8;

  if (temperature <= idealTemperature) {
    const coolDelta = idealTemperature - temperature;
    if (coolDelta <= 1) return 0.95;
    if (coolDelta <= 2) return 0.88;
    if (coolDelta <= 3.5) return 0.78;
    if (coolDelta <= 5) return 0.62;
    return 0.45;
  }

  const warmDelta = temperature - idealTemperature;
  if (warmDelta <= 1.5) return 0.93;
  if (warmDelta <= 3) return 0.86;
  if (warmDelta <= 4.5) return 0.76;
  if (warmDelta <= 6) return 0.64;
  if (warmDelta <= 8) return 0.5;
  return 0.35;
};

const scorePsi = (psi: number | undefined): number => {
  if (psi == null) {
    return 0.55;
  }

  if (psi <= 50) return 0.95;
  if (psi <= 100) return 0.75;
  if (psi <= 200) return 0.4;
  if (psi <= 300) return 0.2;
  return 0.1;
};

const scoreUv = (uv: number | undefined): number => {
  if (uv == null) {
    return 0.55;
  }

  if (uv <= 2) return 0.95;
  if (uv <= 5) return 0.8;
  if (uv <= 7) return 0.6;
  if (uv <= 10) return 0.35;
  return 0.15;
};

const scoreParking = (
  parking: Array<{ total_lots?: number; lots_available?: number }>,
): {
  score: number;
  occupancyScore: number;
  emptyLotsAbsolute: number;
  emptyLotsScore: number;
} => {
  if (parking.length === 0) {
    return {
      score: 0.2,
      occupancyScore: 0.2,
      emptyLotsAbsolute: 0,
      emptyLotsScore: 0.2,
    };
  }

  const totals = parking.reduce(
    (acc, item) => {
      const totalLots = Math.max(0, item.total_lots ?? 0);
      const availableLots = Math.max(0, item.lots_available ?? 0);

      return {
        totalLots: acc.totalLots + totalLots,
        availableLots: acc.availableLots + availableLots,
      };
    },
    { totalLots: 0, availableLots: 0 },
  );

  if (totals.totalLots <= 0) {
    return {
      score: 0.2,
      occupancyScore: 0.2,
      emptyLotsAbsolute: totals.availableLots,
      emptyLotsScore: 0.2,
    };
  }

  const occupancyScore = Math.min(1, totals.availableLots / totals.totalLots);
  const emptyLotsAbsolute = totals.availableLots;
  const emptyLotsScore = emptyLotsAbsolute / (emptyLotsAbsolute + 100);

  return {
    score: occupancyScore * 0.7 + emptyLotsScore * 0.3,
    occupancyScore,
    emptyLotsAbsolute,
    emptyLotsScore,
  };
};

const toRecommendation = (score: number): 'GO' | 'MAYBE' | 'NO_GO' => {
  if (score >= 0.67) {
    return 'GO';
  }
  if (score >= 0.45) {
    return 'MAYBE';
  }
  return 'NO_GO';
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const lambdaClient = getLambdaClient(event);

    const body = event.body
      ? (JSON.parse(event.body) as RecommendationRequest)
      : ({} as RecommendationRequest);

    let latitude = body.latitude;
    let longitude = body.longitude;

    if ((latitude == null || longitude == null) && body.postalCode) {
      const coordinates = await getCoordinatesFromPostalCode(body.postalCode);
      if (coordinates) {
        latitude = coordinates.latitude;
        longitude = coordinates.longitude;
      }
    }

    if (latitude == null || longitude == null) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: 'Provide latitude/longitude or a geocodable postal code',
        }),
      };
    }

    const lambdaEvent = {
      queryStringParameters: {
        latitude: String(latitude),
        longitude: String(longitude),
      },
    };

    const [weatherMetadataRaw, twoHrRaw, parkingRaw] = await Promise.all([
      invokeLambda(lambdaClient, WEATHER_METADATA_FUNCTION_NAME, lambdaEvent),
      invokeLambda(lambdaClient, WEATHER_2HR_FUNCTION_NAME, lambdaEvent),
      invokeLambda(lambdaClient, CARPARK_FUNCTION_NAME, lambdaEvent),
    ]);

    const weatherMetadata = weatherMetadataRaw as WeatherMetadataEnvelope;

    const twoHr = twoHrRaw as {
      data: {
        forecast?: string;
        area?: string;
        timestamp?: string;
      };
    };
    const parking = parkingRaw as {
      parking?: Array<{ total_lots?: number; lots_available?: number }>;
    };

    const weatherConditionScore = scoreWeather(twoHr.data.forecast ?? '');
    const temperatureValue =
      weatherMetadata.temperature?.data?.temperature ??
      weatherMetadata.data?.temperature?.data?.temperature;
    const singaporeNow = getSingaporeNow();
    const singaporeHour = getSingaporeHour(singaporeNow);
    const singaporeMonthIndex = getSingaporeMonthIndex(singaporeNow);
    const temperatureBaseline = estimateMonthlyBaselineTemperature(
      singaporeMonthIndex,
      singaporeHour,
    );
    const temperatureScore = scoreTemperature(
      temperatureValue,
      temperatureBaseline,
    );
    const weatherScore = weatherConditionScore * 0.7 + temperatureScore * 0.3;
    const {
      score: parkingScore,
      occupancyScore: parkingOccupancyScore,
      emptyLotsAbsolute: parkingEmptyLotsAbsolute,
      emptyLotsScore: parkingEmptyLotsScore,
    } = scoreParking(parking.parking ?? []);
    const psiValue =
      weatherMetadata.psi?.data?.psiTwentyFourHourly ??
      weatherMetadata.data?.psi?.data?.psiTwentyFourHourly;
    const uvValue =
      weatherMetadata.uv?.data?.value ?? weatherMetadata.data?.uv?.data?.value;
    const psiScore = scorePsi(psiValue);
    const uvScore = scoreUv(uvValue);

    const weights = {
      weather: 0.3,
      parking: 0.4,
      psi: 0.25,
      uv: 0.05,
    };

    const weightTotal =
      weights.weather + weights.parking + weights.psi + weights.uv;

    const rawCompositeScore =
      weatherScore * weights.weather +
      parkingScore * weights.parking +
      psiScore * weights.psi +
      uvScore * weights.uv;

    const normalizedCompositeScore =
      weightTotal > 0 ? rawCompositeScore / weightTotal : 0;

    const compositeScore = Math.max(0, Math.min(1, normalizedCompositeScore));
    const recommendation = toRecommendation(compositeScore);

    const summary =
      recommendation === 'GO'
        ? 'Conditions are acceptable overall. It is a good time to go!'
        : recommendation === 'MAYBE'
          ? 'Hmm...Conditions are mixed. You may want to go with caution.'
          : 'Current conditions are not favorable. Consider postponing your trip, or use our notification system to remind you in a few hours!';

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        location: {
          postalCode: body.postalCode,
          latitude,
          longitude,
        },
        score: Number(compositeScore.toFixed(3)),
        recommendation,
        summary,
        weights,
        factors: {
          weatherConditionScore,
          weatherScore,
          temperatureValue,
          temperatureBaseline,
          temperatureScore,
          singaporeHour,
          singaporeMonthIndex,
          parkingScore,
          parkingOccupancyScore,
          parkingEmptyLotsAbsolute,
          parkingEmptyLotsScore,
          psiScore,
          uvScore,
          psiValue,
          uvValue,
        },
        details: {
          weatherMetadata,
          weather2hr: twoHr,
          parking,
        },
      }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: 'Failed to derive recommendation',
        message,
      }),
    };
  }
};
