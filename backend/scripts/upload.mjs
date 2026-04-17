import proj4 from 'proj4';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const svy21 = "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs";
const wgs84 = 'EPSG:4326';

const getArgValue = (flag) => {
  const prefixed = `--${flag}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(prefixed));
  if (equalsArg) {
    return equalsArg.slice(prefixed.length);
  }

  const index = process.argv.findIndex((arg) => arg === `--${flag}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return undefined;
};

const stage =
  getArgValue('stage') ?? process.env.STAGE ?? process.env.NODE_ENV ?? 'dev';
const region =
  getArgValue('region') ?? process.env.AWS_REGION ?? 'ap-southeast-1';
const endpoint = getArgValue('endpoint') ?? process.env.DDB_ENDPOINT;
const csvPath = getArgValue('csv') ?? './src/config/HDBCarparkInformation.csv';
const tableName =
  getArgValue('table') ??
  process.env.CARPARK_METADATA_TABLE ??
  `carpark-metadata-${stage}`;

const clientConfig = endpoint
  ? {
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'MockAccessKeyId',
        secretAccessKey:
          process.env.AWS_SECRET_ACCESS_KEY ?? 'MockSecretAccessKey',
      },
    }
  : { region };

const client = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(client);

async function upload() {
  try {
    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvData, { columns: true, skip_empty_lines: true });

    console.log(`🚀 Upserting ${records.length} carparks into ${tableName}...`);

    let upsertedCount = 0;
    let skippedCount = 0;

    for (const row of records) {
      const x = parseFloat(row['x_coord']);
      const y = parseFloat(row['y_coord']);

      if (!isNaN(x) && !isNaN(y)) {
        const [lon, lat] = proj4(svy21, wgs84, [x, y]);
        const item = { ...row };

        // Normalize ID so availability API lookups remain stable.
        item.carpark_number = String(row['car_park_no'] ?? '')
          .trim()
          .toUpperCase();

        if (!item.carpark_number) {
          skippedCount++;
          continue;
        }

        item.latitude = lat;
        item.longitude = lon;
        item.gantry_height = parseFloat(row['gantry_height']) || 0;
        item.car_park_decks = parseInt(row['car_park_decks']) || 0;

        await docClient.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
          }),
        );
        upsertedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(
      `✅ Success! Upserted: ${upsertedCount}, Skipped (invalid coords/id): ${skippedCount}.`,
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error during seeding:', message);
    process.exit(1);
  }
}

upload();