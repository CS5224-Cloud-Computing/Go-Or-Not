# Go-Or-Not

## Developer Guide

### Project Overview

Go-Or-Not is a weather and traffic advisory application that helps users decide whether to go out based on weather, traffic, parking availability, and other conditions. The app provides personalized recommendations via a web interface and email notifications.

### Tech Stack

**Backend:**
- Node.js + TypeScript
- Serverless Framework (AWS Lambda)
- AWS DynamoDB
- AWS API Gateway
- AWS EventBridge
- AWS SES (email notifications)
- Docker (local DynamoDB)

**Frontend:**
- React 18
- TypeScript
- Vite
- SCSS Modules

**Infrastructure:**
- AWS Amplify (CI/CD)
- AWS CloudFormation (IaC via Serverless)

### Project Structure

```
Go-Or-Not/
├── backend/                      # Serverless Lambda functions
│   ├── src/
│   │   ├── handlers/             # API endpoint handlers
│   │   ├── services/             # Core business logic (weather, parking, etc.)
│   │   ├── types/                # TypeScript type definitions
│   │   ├── utils/                # Shared utilities (cache, DynamoDB, etc.)
│   │   └── config/               # Configuration and API mappings
│   ├── serverless.yml            # IaC: Lambda, DynamoDB, API Gateway, EventBridge
│   └── scripts/                  # Database utilities
├── frontend/                     # React Vite application
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   ├── pages/                # Page components (ShouldIGo, Traffic, etc.)
│   │   ├── types/                # TypeScript interfaces
│   │   └── assets/               # Images, icons, etc.
│   └── vite.config.ts            # Build configuration
├── amplify.yml                   # CI/CD pipeline configuration
└── README.md                     # This file
```

### Backend Architecture

The backend is a serverless event-driven system:

**API Endpoints:**
- `GET /health` — Health check
- `GET /temperature` — Get current temperature
- `GET /weather` — Get 2-hour weather forecast
- `GET /weather-metadata` — Get weather metadata (UV, PSI, etc.)
- `GET /traffic-images` — Get nearby traffic camera images
- `GET /parking` — Get parking availability
- `POST /recommendation` — Get GO/NO_GO recommendation (orchestrator)
- `POST /notifications/subscribe` — Subscribe to email alerts
- `GET /notifications/verify` — Verify email subscription

**Core Services:**
- **Weather Service** — Fetches real-time and forecast weather data
- **Traffic Service** — Retrieves traffic camera images and data
- **Parking Service** — Queries carpark availability
- **Temperature Service** — Gets temperature data
- **Recommendation Orchestrator** — Combines all data sources and outputs GO/NO_GO

**Scheduled Jobs (EventBridge):**
- `checker` — Runs every 15 minutes to process pending notifications

**Data Storage (DynamoDB):**
- `weather-metadata-cache-{stage}` — Cached metadata with TTL
- `weather-2hr-cache-{stage}` — Cached forecasts with TTL
- `carpark-metadata-{stage}` — Static carpark information
- `carpark-availability-cache-{stage}` — Dynamic availability with TTL
- `notifications-{stage}` — Subscription records with GSI for status queries

### Local Development Setup

#### Prerequisites
- Node.js 18+
- Docker (for local DynamoDB)
- AWS credentials configured (for deployment)

#### Backend Setup

```bash
cd backend
npm install
npm run dev
```

This starts:
- Local DynamoDB (Docker)
- API on `http://localhost:3001`
- Hot reload on file changes

#### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

#### Full Stack Development

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

Then navigate to `http://localhost:5173` to see the app with live API calls to the local backend.

### Branching Strategy

This project follows Git Flow for deployments across AWS Amplify:

- **`main` branch** → **Production** (`prod` stage)
  - Always stable and production-ready
  - Use for customer-facing deployments
  - Protected branch—merge only via PR review

- **`dev` branch** → **Development** (`dev` stage)
  - Testing and staging environment
  - Integration point for feature branches
  - Unstable, for testing features before production

- **Feature branches** → Deploy to `dev` stage
  - Branch off from `dev`: `git checkout -b feature/your-feature dev`
  - Create PR to merge back to `dev` for testing
  - Once tested and approved in `dev`, merge to `main` for production

### Deployment Workflow

1. **Start a feature**:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature
   ```

2. **Make changes and test locally**:
   ```bash
   # Backend changes
   cd backend && npm run dev
   
   # Frontend changes
   cd frontend && npm run dev
   ```

3. **Push and test in `dev` stage** (auto-deployed via Amplify):
   ```bash
   git push origin feature/your-feature
   ```
   - AWS Amplify auto-deploys to `dev` stage
   - Test your changes at the dev API endpoint

4. **Merge to dev**:
   - Create PR from `feature/your-feature` → `dev`
   - Review code and test in `dev` stage
   - Merge to `dev`

5. **Release to production**:
   - Create PR from `dev` → `main`
   - Final review and testing
   - Merge to `main`
   - Automatic deployment to `prod` stage (production)

### Environment Configuration

#### Backend Environment Variables (AWS Amplify)

Production (`main` branch):
- `SENDER_EMAIL` — Verified SES email identity for notifications
- `APP_BASE_URL` — Frontend URL (e.g., `https://example.com`)
- `GOOGLE_MAPS_API_KEY` — Optional, for postal code geocoding
- `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` — Serverless Framework auth

Development (`dev` branch):
- Same as production, but with dev endpoints

#### Local Development (.env files)

Not required for local dev—DynamoDB runs in Docker and API endpoints are mocked/local.

### Amplify Configuration

Branch-to-stage mapping is configured in `amplify.yml`:
- `main` → `prod` stage (production Lambda, DynamoDB)
- All other branches → `dev` stage (development Lambda, DynamoDB)

**Setup in Amplify Console:**
1. Go to Amplify Console
2. Click **Deployments** → **Repository settings**
3. Connect branches:
   - Add `main` (automatically creates prod stage)
   - Add `dev` (automatically creates dev stage)
   - Add feature branches (deploy to dev stage)
4. Go to **App settings** → **General**
5. Set **Production branch** to `main`
6. Add environment variables under **Build settings** → **Environment variables**

### Common Development Tasks

**Running Tests:**
```bash
cd backend && npm run test
cd frontend && npm run test
```

**Building for Production:**
```bash
# Backend (Amplify handles this)
cd backend && npm run build

# Frontend
cd frontend && npm run build
```

**Adding a New Lambda Handler:**
1. Create file in `backend/src/handlers/myhandler/index.ts`
2. Add function to `backend/serverless.yml`
3. Restart `npm run dev` in backend
4. Handler is available at `/myhandler` endpoint

**Adding a New DynamoDB Table:**
1. Define in `backend/serverless.yml` under `resources`
2. Restart `npm run dev` to create table locally
3. Deploy to AWS via Amplify

**Debugging Backend:**
- Local logs: Check terminal running `npm run dev`
- Cloud logs: AWS CloudWatch → Lambda logs

**Debugging Frontend:**
- Browser DevTools (F12)
- React DevTools browser extension
- Check network requests to API

### Further Reading

- **Backend details**: [backend/README.md](backend/README.md)
- **Frontend details**: [frontend/README.md](frontend/README.md)
- **API docs**: See endpoint schemas in `backend/src/handlers/*/schema.json`
