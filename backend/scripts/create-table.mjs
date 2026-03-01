import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';

const client = new DynamoDBClient({
  region: 'localhost',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'MockAccessKeyId',
    secretAccessKey: 'MockSecretAccessKey',
  },
});

// Read and parse serverless.yml
const serverlessConfig = load(readFileSync('./serverless.yml', 'utf8'));
const resources = serverlessConfig.resources?.Resources || {};
const stage = 'dev';

// Find all DynamoDB tables
const tableDefinitions = Object.entries(resources)
  .filter(([_, config]) => config.Type === 'AWS::DynamoDB::Table')
  .map(([_, config]) => config.Properties);

if (tableDefinitions.length === 0) {
  console.log('⚠️  No DynamoDB tables found in serverless.yml');
  process.exit(0);
}

// Create each table
for (const tableProps of tableDefinitions) {
  // Replace serverless variables with actual values
  const tableName = tableProps.TableName
    .replace(/\$\{self:provider\.stage\}/g, stage)
    .replace(/\$\{self:custom\.tableName\}/g, `go-or-not-${stage}`)
    .replace(/\$\{self:custom\.weatherMetadataTableName\}/g, `weather-metadata-cache-${stage}`);

  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: tableProps.BillingMode || 'PAY_PER_REQUEST',
        AttributeDefinitions: tableProps.AttributeDefinitions,
        KeySchema: tableProps.KeySchema,
        GlobalSecondaryIndexes: tableProps.GlobalSecondaryIndexes,
        LocalSecondaryIndexes: tableProps.LocalSecondaryIndexes,
      })
    );
    console.log(`✅ Table '${tableName}' created successfully!`);
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log(`ℹ️  Table '${tableName}' already exists`);
    } else {
      console.error(`❌ Error creating table '${tableName}':`, error.message);
      process.exit(1);
    }
  }
}

console.log('\n🎉 All tables ready!');

