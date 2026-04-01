import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { createHash, randomUUID } from 'node:crypto';
import { dynamoDb } from '../../utils/dynamodb.js';
import { jsonHeaders } from '../../utils/headers.js';

type SubscribePayload = {
  email?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  notifyAfterHours?: 1 | 2 | 4 | 8 | 24;
};

const notificationsTable = process.env.NOTIFICATIONS_TABLE ?? '';
const senderEmail = process.env.SENDER_EMAIL ?? '';
const appBaseUrl = process.env.APP_BASE_URL ?? '';

const sesClient = new SESClient({});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedHours = new Set([1, 2, 4, 8, 24]);

const hashValue = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const deriveApiBaseUrl = (event: APIGatewayProxyEvent): string | null => {
  const explicitBaseUrl = appBaseUrl.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const host = event.headers.host ?? event.headers.Host;
  if (!host) {
    return null;
  }

  const protocol = event.headers['x-forwarded-proto'] ?? 'https';
  const stage = event.requestContext.stage;

  if (!stage || stage === '$default') {
    return `${protocol}://${host}`;
  }

  return `${protocol}://${host}/${stage}`;
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const payload = JSON.parse(event.body) as SubscribePayload;
    const email = payload.email?.trim().toLowerCase();
    const postalCode = payload.postalCode?.trim();
    const latitude = payload.latitude;
    const longitude = payload.longitude;
    const notifyAfterHours = payload.notifyAfterHours;

    if (!email || !emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'A valid email is required' }),
      };
    }

    if (latitude == null || longitude == null) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: 'latitude and longitude are required for subscriptions',
        }),
      };
    }

    if (!notifyAfterHours || !allowedHours.has(notifyAfterHours)) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'notifyAfterHours must be one of 1,2,4,8,24' }),
      };
    }

    const userAgent = event.headers['user-agent'] ?? 'anonymous';
    const locationKey = `${postalCode ?? ''}|${latitude}|${longitude}`;
    const locationHash = hashValue(locationKey).slice(0, 16);
    const subscriptionKey = hashValue(`${email}|${locationHash}|${userAgent}`);
    const verificationToken = randomUUID();

    const nowEpoch = Math.floor(Date.now() / 1000);
    const nextCheckAt = nowEpoch + notifyAfterHours * 3600;
    const ttl = nowEpoch + 30 * 24 * 3600;

    await dynamoDb.send(
      new PutCommand({
        TableName: notificationsTable,
        Item: {
          subscriptionKey,
          status: 'PENDING',
          verificationToken,
          email,
          postalCode,
          latitude,
          longitude,
          notifyAfterHours,
          nextCheckAt,
          createdAt: nowEpoch,
          updatedAt: nowEpoch,
          ttl,
        },
      }),
    );

    const baseUrl = deriveApiBaseUrl(event);

    if (senderEmail && baseUrl) {
      const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const verifyUrl = new URL('notifications/verify', normalizedBaseUrl);
      verifyUrl.searchParams.set('subscriptionKey', subscriptionKey);
      verifyUrl.searchParams.set('token', verificationToken);

      const locationDisplay = postalCode
        ? `📍 Postal Code: ${postalCode}`
        : `📍 Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      await sesClient.send(
        new SendEmailCommand({
          Source: senderEmail,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: '✓ Confirm your Go-Or-Not notification subscription' },
            Body: {
              Text: {
                Data:
                  `Welcome to Go-Or-Not!\n\n` +
                  `We're excited to help you make smarter decisions about your outings. Go-Or-Not analyses weather, parking availability, air quality (PSI), and UV index to give you personalized recommendations.\n\n` +
                  `VERIFY YOUR EMAIL\n` +
                  `To activate your notifications, please confirm this email by visiting:\n\n` +
                  `${verifyUrl.toString()}\n\n` +
                  `SUBSCRIPTION DETAILS\n` +
                  `${locationDisplay}\n` +
                  `Update Frequency: Every ${notifyAfterHours} hour(s)\n\n` +
                  `WHAT YOU'LL RECEIVE\n` +
                  `Once verified, you'll get timely recommendations about whether it's a good time to go out, based on:\n` +
                  `🌤️  Weather conditions and temperature\n` +
                  `🅿️  Parking availability\n` +
                  `💨 Air quality (PSI)\n` +
                  `☀️  UV index\n\n` +
                  `If you did not request this subscription, you can safely ignore this email.\n\n` +
                  `Best regards,\nThe Go-Or-Not Team`,
              },
            },
          },
        }),
      );
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        subscriptionKey,
        status: 'PENDING',
        message:
          senderEmail && baseUrl
            ? 'Verification email sent. Please confirm to activate notifications.'
            : 'Subscription created in PENDING state. Configure SENDER_EMAIL and APP_BASE_URL to send verification links.',
      }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: 'Failed to create subscription',
        message,
      }),
    };
  }
};
