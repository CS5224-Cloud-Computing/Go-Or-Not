# Go or Not frontend

React + TypeScript + Vite frontend for the Go-Or-Not app. This UI lets users:
- search destinations in Singapore,
- view weather/air-quality/parking based trip recommendations,
- browse live traffic camera feeds,
- subscribe to email updates and verify subscriptions.

## Table of contents
- [Project overview](#project-overview)
- [Core user flows](#core-user-flows)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment configuration](#environment-configuration)
- [Backend integration](#backend-integration)
- [Route reference](#route-reference)
- [Component reference](#component-reference)
- [Styling approach](#styling-approach)
- [Scripts](#scripts)

## Project overview
The frontend is a single-page app with three routes:
- `/` (Should I Go): main recommendation dashboard.
- `/traffic`: live traffic camera view by highway.
- `/notifications/verify`: email verification landing page.

It reads the backend base URL from `VITE_API_BASE_URL` and calls backend APIs for weather, recommendation, traffic, parking, and notification flows.

## Core user flows

### 1. Should I Go dashboard
1. User types an address in the destination input.
2. Frontend calls OneMap search API for autocomplete suggestions.
3. On selection, UI updates coordinates and postal code.
4. Frontend calls backend APIs in parallel:
   - `GET /weather`
   - `GET /weather-metadata`
   - `POST /recommendation`
5. UI renders:
   - current weather and "feels like" temperature,
   - UV and PSI gauges,
   - recommendation card (`GO` / `MAYBE` / `NO_GO`),
   - optional "Why?" modal with detailed factor breakdown.
6. Frontend requests nearby parking and displays map markers in OneMap iframe.
7. User can submit notification subscription (see below on _3. Notification verification_). 

### 2. Traffic cameras
1. User opens Traffic page.
2. User selects highway tab (`AYE`, `BKE`, `CTE`, `ECP`, `KJE`, `PIE`, `SLE`, `TPE`).
3. Frontend calls `GET /traffic-images?highway=...`.
4. UI renders traffic image cards and last fetched timestamp.

### 3. Notification verification
1. User types an address in the destination input.
2. User types an email in the email input. 
  - Since [Amazon Simple Email Service is still in sandbox mode](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html), you can use this verified recipient email to receive notifications from AWS SES:
    - **Email**: goornot.5224@gmail.com
    - **Password**: Gocs5224
3. User chooses a duration to be notified (e.g. 1 hour later) and clicks the "Notify Me" button. 
4. A verification email is sent to the email address. 
5. User opens the verification link containing `subscriptionKey` and `token`.
6. Frontend calls `GET /notifications/verify` with query params.
7. UI shows success or error state.

## Tech stack
- React 19
- TypeScript
- Vite 7
- React Router 7
- Radix UI (`Dialog`, `Accordion`, `Tooltip`)
- Lucide React icons
- Sass modules + global CSS
- ESLint (JS + TypeScript + React Hooks + React Refresh)

## Project structure
```text
frontend/
  src/
    App.tsx
    main.tsx
    config.ts
    index.css
    assets/
    pages/
      ShouldIGo.tsx
      Traffic.tsx
      NotificationVerify.tsx
      NotificationVerify.module.scss
    components/
      Navbar.tsx
      InfoTooltip.tsx
      OverviewDetails/
        index.tsx
        styles.module.scss
        components/
          accordionSection/
          indicatorBanner/
    types/
      recommendation.ts
  public/
  .env.example
  vite.config.ts
  eslint.config.js
```

Key directories and files:
- `src/App.tsx`: top-level router + app shell
- `src/config.ts`: centralized `API_BASE_URL` from Vite env
- `src/pages/ShouldIGo.tsx`: destination search, weather / recommendation, map integration, subscription submission.
- `src/pages/Traffic.tsx`: traffic camera tabs and feed cards
- `src/pages/NotificationVerify.tsx`: verification status page
- `src/components/OverviewDetails`: modal with detailed recommendation factors
- `src/types/recommendation.ts`: typed response contract for recommendation API

## Getting started
Prerequisites:
- Node.js 20+
- npm
- Backend running locally or deployed

Install dependencies:
```bash
npm install
```

Start development server:
```bash
npm run dev
```

Default Vite URL:
- `http://localhost:5173`

## Environment configuration
Create `.env` in `frontend/` (or copy from `.env.example`)

Runtime variable used by frontend code:
- `VITE_API_BASE_URL`
  - Example: `http://localhost:3001`
  - Used in `src/config.ts` as the backend API base URL

`.env.example` also contains backend deploy variables (`SENDER_EMAIL`, `APP_BASE_URL`, `GOOGLE_MAPS_API_KEY`) for CI/deployment workflows, but those are not consumed directly by React runtime code

## Backend integration
### APIs consumed
| Feature | Method | Endpoint |
| --- | --- | --- |
| Weather forecast | `GET` | `/weather?latitude={lat}&longitude={lon}` |
| Weather metadata | `GET` | `/weather-metadata?latitude={lat}&longitude={lon}` |
| Recommendation | `POST` | `/recommendation` |
| Parking | `GET` | `/parking?latitude={lat}&longitude={lon}` |
| Traffic images | `GET` | `/traffic-images?highway={name}` |
| Subscribe notifications | `POST` | `/notifications/subscribe` |
| Verify subscription | `GET` | `/notifications/verify?subscriptionKey={key}&token={token}` |

### Response handling patterns
- Recommendation response is strongly typed via `RecommendationResponse`
- Weather metadata supports partial payloads; frontend reads `data` envelope when present

## Route reference
| Route | Component | Purpose |
| --- | --- | --- |
| `/` | `ShouldIGo` | Main planning dashboard with destination search, recommendation, map, and subscription form |
| `/traffic` | `Traffic` | Highway-based live camera grid |
| `/notifications/verify` | `NotificationVerify` | Verification result page for email links |

## Component reference
### Layout
- `Navbar`: route switching between main dashboard and traffic page
- `app-shell` + `page-content`: global app frame

### Should I Go page
- `InfoTooltip`: contextual explanatory tooltips
- UV/PSI gauges: semicircle SVG indicators with category color coding
- Overview card: primary recommendation summary
- `OverviewDetails`: modal for explanation details
  - `AccordionSection`: collapsible sections
  - `IndicatorBanner`: color-coded status strips

### Traffic page
- Tabbed highway selector
- Responsive card grid of camera images

### Verification page
- URL-query driven verification state (`loading`, `success`, `error`)

## Styling approach
- Global styles are in `src/index.css`
- SCSS modules are used where local component scoping is useful:
  - `NotificationVerify.module.scss`
  - `OverviewDetails/styles.module.scss`
- UI uses a responsive split layout for the main page:
  - desktop: two-column dashboard + map,
  - mobile: single-column stacked layout

## Scripts
| Script | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development server |
| `npm run build` | Type-check + production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build locally |
