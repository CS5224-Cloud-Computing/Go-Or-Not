# Go or Not backend

Backend API and orchestration layer for Go-Or-Not. This service aggregates real-time Singapore data sources (weather, air quality, UV, parking, traffic), computes a weighted recommendation (`GO`, `MAYBE`, `NO_GO`), and supports email notifications with opt-in verification.

## Table of contents
- [Quick start](#quick-start)
- [What this backend does](#what-this-backend-does)
- [Backend folder structure](#backend-folder-structure)
- [Architecture and implementation details](#architecture-and-implementation-details)
  - [1. Request/response flow](#1-requestresponse-flow)
  - [2. Recommendation orchestration flow](#2-recommendation-orchestration-flow)
  - [3. Notification lifecycle](#3-notification-lifecycle)
  - [4. Partial success behavior](#4-partial-success-behavior)
- [Cloud services and tools (purpose of each)](#cloud-services-and-tools-purpose-of-each)
- [DynamoDB tables and data model](#dynamodb-tables-and-data-model)
- [Cache strategy](#cache-strategy)
- [API reference](#api-reference)
  - [Health](#health)
  - [Temperature](#temperature)
  - [Weather metadata (aggregated)](#weather-metadata-aggregated)
  - [2-hour weather](#2-hour-weather)
  - [Traffic images](#traffic-images)
  - [Parking](#parking)
  - [Recommendation](#recommendation)
  - [Subscribe notifications](#subscribe-notifications)
  - [Verify notifications](#verify-notifications)
- [Environment variables](#environment-variables)
  - [Required for cloud deployment](#required-for-cloud-deployment)
  - [Common runtime variables](#common-runtime-variables)
- [Local development and operations](#local-development-and-operations)
- [Deployment model](#deployment-model)
- [How to extend](#how-to-extend)
  - [Add a new Lambda endpoint](#add-a-new-lambda-endpoint)
  - [Add a new DynamoDB table](#add-a-new-dynamodb-table)
  - [Add a new cached data source](#add-a-new-cached-data-source)

## Quick start
Prerequisites:
- Node.js 20+
- Docker (running)

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Navigate to `http://localhost:3001/health`. You should see "Lambda is
   running"
The `dev` script automatically:
- Starts DynamoDB Local via Docker (`docker-compose up -d`)
- Creates all DynamoDB tables defined in `serverless.yml`
- Seeds HDB carpark metadata from CSV
- Starts `serverless offline` with hot reload on port 3001

## What the backend does
- Exposes HTTP endpoints through API Gateway and Lambda
- Pulls real-time data from data.gov.sg APIs (weather, PSI, UV, traffic, carpark)
- Caches expensive upstream calls in DynamoDB with TTL
- Computes a recommendation score from multiple weighted factors
- Manages notification subscriptions in DynamoDB
- Sends verification and status emails via Amazon SES
- Runs a scheduled checker Lambda every 15 minutes via EventBridge Scheduler

## Backend folder structure
```text
backend/
  src/
    config/
      api.ts
      trafficCameraMapping.ts
      HDBCarparkInformation.csv
    handlers/
      checker/
      health/
      getTemperature/
      getWeatherMetadata/
      get2hrWeather/
      getTrafficImages/
      getParking/
      getRecommendation/
      subscribeNotification/
      verifyNotification/
    services/
      2hrweather/
      carpark/
      psi/
      temperature/
      trafficImages/
      uv/
    types/
    utils/
      cache.ts
      dynamodb.ts
      headers.ts
      utils.ts
  scripts/
    create-table.mjs
    upload.mjs
  docker-compose.yml
  package.json
  serverless.yml
  tsconfig.json
```

Key responsibilities:
- `src/handlers`: Lambda entry points, request validation, HTTP status handling
- `src/services`: domain logic for each data source
- `src/utils/cache.ts`: reusable DynamoDB-backed cache wrappers
- `src/utils/dynamodb.ts`: AWS / local DynamoDB client wiring
- `src/config/api.ts`: external API base URLs
- `scripts/create-table.mjs`: creates all local DynamoDB tables by reading
  `serverless.yml`
- `scripts/upload.mjs`: seeds `carpark-metadata-dev` from `HDBCarparkInformation.csv` and converts SVY21 -> WGS84 coordinates

## Architecture and implementation details
### 1. Request/response flow
1. Client calls API Gateway endpoint.
2. API Gateway invokes corresponding Lambda handler.
3. Handler validates input and delegates to service layer.
4. Service layer tries DynamoDB cache first.
5. On cache miss, service calls external API, stores result with TTL, and
   returns normalized response.

### 2. Recommendation orchestration flow
`POST /recommendation` in `getRecommendation`:
1. Accepts either:
   - `latitude` + `longitude`, or
   - `postalCode` (requires `GOOGLE_MAPS_API_KEY` for geocoding).
2. Invokes downstream Lambdas in parallel via AWS SDK Lambda Invoke API:
   - `getWeatherMetadata`
   - `get2hrWeather`
   - `getParking`
3. Computes factor scores:
   - Weather condition score from forecast text
   - Temperature score against a Singapore monthly/hourly baseline model
   - Parking score from occupancy ratio and absolute empty lot count
   - PSI and UV scores from threshold bands
4. Applies weighted composition:
   - Weather: 30%
   - Parking: 40%
   - PSI: 25%
   - UV: 5%
5. Converts final score to recommendation:
   - `GO`: score >= 0.67
   - `MAYBE`: 0.45 to < 0.67
   - `NO_GO`: < 0.45
6. Returns recommendation, score, factors, and raw detail payloads

### 3. Notification lifecycle
Subscription lifecycle in `notifications-{stage}`:

1. `POST /notifications/subscribe`
   - Validates `email`, `latitude`, `longitude`, `notifyAfterHours`
   - Creates deterministic `subscriptionKey` and random `verificationToken`
   - Stores item with status `PENDING`, `nextCheckAt`, and TTL
   - Sends verification email (if `SENDER_EMAIL` and base URL are configured)
2. `GET /notifications/verify`
   - Validates token and flips status to `ACTIVE`
3. `checker` (scheduled every 15 minutes)
   - Queries GSI `status-nextCheckAt-index` for due `ACTIVE` subscriptions
   - Invokes `getRecommendation` for each due subscription
   - Sends notification email with recommendation summary
   - Updates status to `NOTIFIED` (single-send behavior in current
     implementation)

### 4. Partial success behavior
`GET /weather-metadata` uses `Promise.allSettled` across temperature, humidity,
wind, PSI, and UV:
- `200`: all sources succeeded
- `207`: one or more sources failed, returns partial data plus per-source errors

## Cloud services and tools
| Tool/Service | Purpose in this project | Where configured |
| --- | --- | --- |
| Serverless Framework | Infrastructure as code and deployment orchestration for functions, API events, IAM, tables, and schedule | `serverless.yml` |
| AWS Lambda | Stateless compute for all handlers and orchestrator logic | `functions` in `serverless.yml`, `src/handlers/*` |
| Amazon API Gateway (HTTP events) | Public HTTP interface for frontend/client calls | `functions.*.events.http` |
| Amazon DynamoDB | Stores cache objects, carpark metadata, and notification subscriptions | `resources.Resources.*Table` |
| DynamoDB TTL | Auto-expiration for cache and subscription records | `TimeToLiveSpecification` on tables |
| DynamoDB GSI (`status-nextCheckAt-index`) | Efficient lookup of due ACTIVE subscriptions for scheduled processing | `NotificationsTable.GlobalSecondaryIndexes` |
| EventBridge Scheduler | Triggers `checker` Lambda every 15 minutes | `CheckerSchedule` resource |
| IAM Roles and Policies | Grants least-required access for DynamoDB, Lambda invoke, SES send, scheduler invoke | `provider.iam.role.statements`, `CheckerScheduleInvokeRole`, Lambda permission resources |
| Amazon SES | Sends verification and recommendation emails | `subscribeNotification`, `checker` handlers |
| CloudWatch Logs | Runtime logs and error visibility for Lambdas | native AWS Lambda logging |
| serverless-offline | Local emulation of API Gateway/Lambda for dev | `plugins`, `custom.serverless-offline` |
| serverless-esbuild | TypeScript bundling/transpilation support in Serverless workflow | `plugins`, `custom.esbuild` |
| Docker + DynamoDB Local | Local DynamoDB runtime for development/testing | `docker-compose.yml` |

Additional external APIs:
- data.gov.sg v2 real-time API:
  - air temperature
  - humidity
  - wind speed
  - PSI
  - UV index
  - 2-hour weather forecast
- data.gov.sg traffic/carpark APIs:
  - traffic camera images
  - carpark availability
- Google Maps Geocoding API (optional):
  - used only when recommendation request provides postal code

## DynamoDB tables and data model
| Table | Primary key | Purpose | TTL |
| --- | --- | --- | --- |
| `cache-{stage}` | `pk` + `sk` | Generic cache for temperature/humidity/wind/psi/uv/traffic service results | Yes (`ttl`) |
| `weather-2hr-cache-{stage}` | `pk` + `sk` | Dedicated 2-hour forecast cache | Yes (`ttl`) |
| `carpark-metadata-{stage}` | `carpark_number` | Seeded static carpark metadata from CSV | No |
| `carpark-availability-cache-{stage}` | `id` | Cached dynamic carpark availability payload | Yes (`ttl`) |
| `notifications-{stage}` | `subscriptionKey` | Notification subscriptions and status transitions | Yes (`ttl`) |

Notifications GSI:
- Index name: `status-nextCheckAt-index`
- Partition key: `status`
- Sort key: `nextCheckAt`
- Used by scheduled checker to fetch due active subscriptions

## Cache strategy
| Domain | Cache key shape | TTL |
| --- | --- | --- |
| Temperature | `TEMPERATURE` + `{lat}#{lon}` | 15 min |
| Humidity | `HUMIDITY` + `{lat}#{lon}` | 15 min |
| Wind speed | `WIND` + `{lat}#{lon}` | 15 min |
| PSI | `PSI` + `{region}` | 15 min |
| UV | `UV` + `LATEST` | 60 min |
| Traffic images | `TrafficImages` + `{highway}` | 15 min |
| 2-hour weather | `WEATHER#{roundedLat}` + `{roundedLon}` | 120 min |
| Carpark availability | `id = LATEST_AVAILABILITY` | 15 min |

## API reference
Base URL (local): `http://localhost:3001`

### Health
- `GET /health`
- Returns runtime heartbeat message and timestamp

### Temperature
- `GET /temperature?latitude={lat}&longitude={lon}`
- Returns nearest station reading

### Weather metadata (aggregated)
- `GET /weather-metadata?latitude={lat}&longitude={lon}&region={optional}`
- Aggregates temperature / humidity / wind / psi / uv
- May return `207` with partial data and source-specific errors
- Note: `region` parameter is currently accepted by route config but not used in
  handler logic

### 2-hour weather
- `GET /weather?latitude={lat}&longitude={lon}`
- Resolves nearest area forecast from NEA 2-hour feed

### Traffic images
- `GET /traffic-images?highway={name}`
- `highway` is required and must be one of:
  - `AYE`
  - `BKE`
  - `CTE`
  - `ECP`
  - `KJE`
  - `PIE`
  - `SLE`
  - `TPE`

### Parking
- `GET /parking?latitude={lat}&longitude={lon}&radiusKm={optional}`
- `radiusKm` defaults to `1.0`

### Recommendation
- `POST /recommendation`
- Body:

```json
{
  "postalCode": "560123",
  "latitude": 1.3521,
  "longitude": 103.8198
}
```

Notes:
- Supply coordinates directly, or supply postal code (geocoding requires
  `GOOGLE_MAPS_API_KEY`)
- Response includes score, classification, factors, and raw details

### Subscribe notifications
- `POST /notifications/subscribe`
- Body:

```json
{
  "email": "user@example.com",
  "postalCode": "560123",
  "latitude": 1.3521,
  "longitude": 103.8198,
  "notifyAfterHours": 4
}
```

Validation rules:
- `notifyAfterHours` must be one of `1`, `2`, `4`, `8`, `24`
- `latitude` and `longitude` are required

### Verify notifications
- `GET /notifications/verify?subscriptionKey={key}&token={token}`
- Activates the pending subscription

## Environment variables
### Required for cloud deployment
- `SENDER_EMAIL`
  - Verified SES identity used to send emails
- `APP_BASE_URL`
  - Public base URL used to construct verification links
- `GOOGLE_MAPS_API_KEY` (optional)
  - Enables postal-code geocoding in recommendation endpoint

### Common runtime variables
These are typically injected by Serverless and should not need manual edits:
- `CACHE_TABLE`
- `WEATHER_CACHE_TABLE`
- `CARPARK_METADATA_TABLE`
- `CARPARK_CACHE_TABLE`
- `NOTIFICATIONS_TABLE`
- `TEMPERATURE_FUNCTION_NAME`
- `WEATHER_METADATA_FUNCTION_NAME`
- `WEATHER_2HR_FUNCTION_NAME`
- `CARPARK_FUNCTION_NAME`
- `ORCHESTRATOR_FUNCTION_NAME`
- `IS_OFFLINE`

## Local development and operations
Available scripts:
- `npm run dev`: full local bootstrap (docker + tables + seed + offline api)
- `npm run docker:up`: start DynamoDB Local
- `npm run docker:down`: stop DynamoDB Local
- `npm run dynamodb:create-table`: create DynamoDB tables from IaC
- `npm run dynamodb:seed`: seed carpark metadata table
- `npm run build`: package serverless artifacts
- `npm run deploy`: deploy default stage
- `npm run deploy:prod`: deploy prod stage
- `npm run remove`: tear down deployed stack

## Deployment model
- Default stage is `dev`
- Stage-aware resource naming avoids table collisions:
  - `cache-dev`, `cache-prod`, etc
- Region defaults to `ap-southeast-1` unless overridden

## How to extend
### Add a new Lambda endpoint
1. Create handler under `src/handlers/<newHandler>/index.ts`.
2. Add function and HTTP event (if public) in `serverless.yml`.
3. Add any required IAM permissions and environment variables.
4. Restart `npm run dev` if local resources changed.

### Add a new DynamoDB table
1. Add resource under `resources.Resources` in `serverless.yml`.
    ```yaml
    resources:
      Resources:
        UsersTable:
          Type: AWS::DynamoDB::Table
          Properties:
            TableName: users-${self:provider.stage}
            BillingMode: PAY_PER_REQUEST
            AttributeDefinitions:
              - AttributeName: userId
                AttributeType: S
            KeySchema:
              - AttributeName: userId
                KeyType: HASH
    ```
2. Add table name to `provider.environment` if referenced by code.
3. Re-run `npm run dynamodb:create-table` locally.

### Add a new cached data source
1. Implement service under `src/services`.
2. Reuse `withCache`, `with2hrWeatherCache`, or `withCarparkCache`.
3. Choose stable key shape and TTL.
4. Expose via handler and wire route in `serverless.yml`.
