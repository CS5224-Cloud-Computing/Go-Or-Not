import type { APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { dynamoDb } from '../../utils/dynamodb.js';
import { jsonHeaders } from '../../utils/headers.js';

type SubscriptionItem = {
  subscriptionKey: string;
  email: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  notifyAfterHours: 1 | 2 | 4 | 8 | 24;
  nextCheckAt: number;
};

const notificationsTable = process.env.NOTIFICATIONS_TABLE ?? '';
const senderEmail = process.env.SENDER_EMAIL ?? '';
const orchestratorFunctionName = process.env.ORCHESTRATOR_FUNCTION_NAME ?? '';

const sesClient = new SESClient({});
const lambdaClient = new LambdaClient({});

const decodePayload = (payload: Uint8Array | undefined): string => {
  if (!payload) {
    return '{}';
  }
  return new TextDecoder().decode(payload);
};

const invokeOrchestrator = async (item: SubscriptionItem): Promise<{
  recommendation?: string;
  summary?: string;
  score?: number;
}> => {
  const invokePayload = {
    body: JSON.stringify({
      postalCode: item.postalCode,
      latitude: item.latitude,
      longitude: item.longitude,
    }),
  };

  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: orchestratorFunctionName,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(JSON.stringify(invokePayload)),
    }),
  );

  if (response.FunctionError) {
    throw new Error(`Orchestrator invocation failed: ${response.FunctionError}`);
  }

  const body = JSON.parse(decodePayload(response.Payload)) as {
    statusCode?: number;
    body?: string;
  };

  if ((body.statusCode ?? 500) >= 400) {
    throw new Error(`Orchestrator returned status ${body.statusCode ?? 500}`);
  }

  return body.body
    ? (JSON.parse(body.body) as {
        recommendation?: string;
        summary?: string;
        score?: number;
      })
    : {};
};

export const handler = async (): Promise<APIGatewayProxyResult> => {
  const nowEpoch = Math.floor(Date.now() / 1000);

  try {
    const dueResponse = await dynamoDb.send(
      new QueryCommand({
        TableName: notificationsTable,
        IndexName: 'status-nextCheckAt-index',
        KeyConditionExpression: '#status = :active AND nextCheckAt <= :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':active': 'ACTIVE',
          ':now': nowEpoch,
        },
      }),
    );

    const dueItems = (dueResponse.Items ?? []) as SubscriptionItem[];

    let notified = 0;
    const errors: Array<{ subscriptionKey: string; reason: string }> = [];

    for (const item of dueItems) {
      try {
        const latest = await invokeOrchestrator(item);

        if (senderEmail) {
          const score = latest.score ?? 0;
          const scorePercentage = Math.round(score * 100);

          const getScoreIcon = (recommendation: string | undefined): string => {
            switch (recommendation) {
              case 'GO':
                return '🟢';
              case 'MAYBE':
                return '🟡';
              case 'NO_GO':
                return '🔴';
              default:
                return '⚪';
            }
          };

          const getScoreInterpretation = (recommendation: string | undefined): string => {
            switch (recommendation) {
              case 'GO':
                return 'Conditions are great! Everything looks favorable for your outing.';
              case 'MAYBE':
                return 'Conditions are mixed. Some factors are good, but there may be minor concerns.';
              case 'NO_GO':
                return 'Conditions are not ideal. Consider rescheduling your outing if possible.';
              default:
                return '';
            }
          };

          const locationDisplay = item.postalCode
            ? `Postal Code: ${item.postalCode}`
            : `Location: ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`;

          const nextCheckTime = new Date((item.nextCheckAt + item.notifyAfterHours * 3600) * 1000);
          const nextCheckTimeString = nextCheckTime.toLocaleString('en-SG', {
            timeZone: 'Asia/Singapore',
          });

          await sesClient.send(
            new SendEmailCommand({
              Source: senderEmail,
              Destination: { ToAddresses: [item.email] },
              Message: {
                Subject: { Data: `${getScoreIcon(latest.recommendation)} Go-Or-Not: ${latest.recommendation ?? 'UNKNOWN'}` },
                Body: {
                  Text: {
                    Data:
                      `Hello!\n\n` +
                      `Here's your latest Go-Or-Not update:\n\n` +
                      `${getScoreIcon(latest.recommendation)} RECOMMENDATION: ${latest.recommendation ?? 'N/A'} (Score: ${scorePercentage}%)\n` +
                      `${getScoreInterpretation(latest.recommendation)}\n\n` +
                      `LOCATION\n` +
                      `${locationDisplay}\n\n` +
                      `DETAILS\n` +
                      `${latest.summary ?? 'No additional details available.'}\n\n` +
                      `NEXT UPDATE\n` +
                      `You'll receive your next check-in on ${nextCheckTimeString} SGT\n\n` +
                      `SCORE BREAKDOWN\n` +
                      `Your recommendation is based on analyzing:\n` +
                      `• Weather (30% weight): Temperature and forecast conditions\n` +
                      `• Parking (40% weight): Availability and occupancy rates\n` +
                      `• Air Quality (25% weight): PSI (Pollutant Standards Index)\n` +
                      `• UV Index (5% weight): Sun exposure levels\n\n` +
                      `Scoring Ranges\n` +
                      `🟢 67%+ = GO: Excellent conditions\n` +
                      `🟡 45-66% = MAYBE: Acceptable with some concerns\n` +
                      `🔴 Below 45% = NO_GO: Challenging conditions\n\n` +
                      `For detailed breakdowns and to manage your subscriptions, visit the app.\n\n` +
                      `---\n` +
                      `To unsubscribe from notifications, access your account settings in the Go-Or-Not app.\n\n` +
                      `Best regards,\nThe Go-Or-Not Team`,
                  },
                },
              },
            }),
          );
        }

        await dynamoDb.send(
          new UpdateCommand({
            TableName: notificationsTable,
            Key: { subscriptionKey: item.subscriptionKey },
            UpdateExpression:
              'SET #status = :status, updatedAt = :updatedAt, lastAttemptAt = :updatedAt REMOVE verificationToken, lastError',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': 'NOTIFIED',
              ':updatedAt': nowEpoch,
            },
          }),
        );

        notified += 1;
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ subscriptionKey: item.subscriptionKey, reason });

        await dynamoDb.send(
          new UpdateCommand({
            TableName: notificationsTable,
            Key: { subscriptionKey: item.subscriptionKey },
            UpdateExpression:
              'SET updatedAt = :updatedAt, lastAttemptAt = :updatedAt, lastError = :lastError ADD attemptCount :attemptInc',
            ExpressionAttributeValues: {
              ':updatedAt': nowEpoch,
              ':lastError': reason.slice(0, 1000),
              ':attemptInc': 1,
            },
          }),
        );
      }
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        processed: dueItems.length,
        notified,
        failed: errors.length,
        errors,
      }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Checker run failed', message }),
    };
  }
};
