# Go-Or-Not

Go-Or-Not is a weather and traffic advisory application that helps users decide whether to go out based on weather, traffic, parking availability, and other conditions. The app provides personalized recommendations via a web interface and email notifications.

### Test email account
Since SES is still in sandbox mode, this recipient email has been verified to receive notifications from AWS SES:
- **Email**: goornot.5224@gmail.com
- **Password**: Gocs5224

## Table of contents
- [Documentation](#documentation)
- [Local development quick start](#local-development-quick-start)
- [Branching strategy](#branching-strategy)
- [Release workflow](#release-workflow)
- [Environment and stage configuration](#environment-and-stage-configuration)
- [Amplify branch mapping](#amplify-branch-mapping)
- [CI/CD workflows (GitHub Actions)](#cicd-workflows-github-actions)
- [Required GitHub secrets](#required-github-secrets)
- [Monitoring deployments](#monitoring-deployments)

## Documentation
Use these two docs for API details, architecture, component behavior, configuration internals, and implementation notes
- Backend documentation: [backend/README.md](backend/README.md)
- Frontend documentation: [frontend/README.md](frontend/README.md)

## Local development quick start
Prerequisites:
- Node.js 20+
- Docker

Backend:
```bash
cd backend
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Default local URLs:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Branching Strategy

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

## Release workflow

1. Create feature branch from `dev` brnach.
2. Make changes and test locally.
3. Open PR from feature branch to `dev` branch. 
    - Merging to `dev` branch automatically triggers Amplify deployment on `dev` stage. 
4. Validate and test in `dev` environment.
5. Open PR from `dev` to `main` for production release.
   - Create PR from `dev` branch to `main` branch (only merges from `dev` branch are allowed)
   - GitHub Actions validates:
     - pull-request.yml (code quality checks)
     - validate-pr-source.yml (ensures dev branch requirement)
     - prod-checks.yml (strict production checks)
   - Final review and testing
   - Merge to `main` branch (auto-deploys to `prod` stage)
   
   **Note**: If you create a PR from any branch other than `dev` to `main`, the validation will fail with instructions to merge via `dev` first.

## Environment and stage configuration
Use stage-specific variables so frontend and backend always point to matching stages.

### Production Environment Variables (AWS Amplify)
Production (`main` branch):
- `SENDER_EMAIL` — Verified SES email identity for notifications
- `APP_BASE_URL_PROD` — Production frontend URL (e.g., `https://main.<app-id>.amplifyapp.com`)
- `VITE_API_BASE_URL_PROD` — Production API Gateway base URL (must point to `/prod` stage)
- `GOOGLE_MAPS_API_KEY` — Optional, for postal code geocoding
- `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` — Serverless Framework auth

Development (`dev` branch):
- `APP_BASE_URL_DEV` — Development frontend URL (e.g., `https://dev.<app-id>.amplifyapp.com`)
- `VITE_API_BASE_URL_DEV` — Development API Gateway base URL (must point to `/dev` stage)
- `SENDER_EMAIL`, `GOOGLE_MAPS_API_KEY`, and Serverless auth vars can be shared with prod

Stage consistency note:
- Keep `APP_BASE_URL` and `VITE_API_BASE_URL` aligned to the same stage to avoid notification verification links pointing to the wrong backend table.

### Local Development
Not required for local as dev—DynamoDB runs in Docker and API endpoints are mocked/local.

## Amplify branch mapping
Branch-to-stage mapping is configured in `amplify.yml`:
- `main` branch → `prod` stage (production Lambda, DynamoDB)
- `dev` branch → `dev` stage (development Lambda, DynamoDB)
**Setup in Amplify Console:**
1. Go to Amplify Console
2. Click **Deployments** → **Repository settings**
3. Connect branches:
   - Add `main` (automatically creates prod stage)
   - Add `dev` (automatically creates dev stage)
4. Go to **App settings** → **General**
5. Set **Production branch** to `main`
6. Add environment variables under **Build settings** → **Environment variables**

### CI/CD Workflows (GitHub Actions)
Four workflows enforce code quality, release safety, and deployment visibility:

#### Purpose

These workflows ensure:
- **Code Quality** — All code is linted, type-checked, and tested before merging
- **Staging before Production** — Changes are tested in dev stage before reaching production
- **Production Safety** — Production deployments have extra validation and security checks
- **Workflow Compliance** — Developers follow the dev→main merge pattern consistently
- **Early Error Detection** — Issues are caught during PR review, not after production deploy
- **Deployment Visibility** — Amplify deployment status appears in GitHub Actions for dev and main

#### **pull-request.yml** — Runs on PRs to `dev`
- **Purpose**: Prevent low-quality code from merging
- Validates backend: lint, type check, tests
- Validates frontend: lint, type check, tests, build
- Must pass before PR to dev can merge
- Fails fast so developers fix issues early

#### **validate-pr-source.yml** — Runs on PRs to `main` branch
- **Purpose**: Enforce staging gate before production (ensures dev→main workflow)
- **Enforces**: Only `dev` branch can merge to `main` (production)
- Blocks PRs from feature branches directly to main
- Guides developers to merge via dev first
- Prevents accidental direct production deployments

#### **prod-checks.yml** — Runs on PRs to `main`
- **Purpose**: Extra validation layer for production releases
- Stricter validation: includes test coverage, security audits
- Runs for dev→main release PRs
- Scans for dependency vulnerabilities
- Checks frontend bundle size
- Prevents insecure or broken production deployments

#### **amplify-deployment-status.yml** — Runs on pushes to `dev` and `main`
- **Purpose**: Show Amplify deployment result directly in GitHub Actions
- Polls AWS Amplify for latest job on the pushed branch
- Marks workflow as failed for failed or cancelled deployments
- Adds deployment summary (branch, job id, status, URL) to run output

**Required GitHub Repository Secrets:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AMPLIFY_APP_ID`
- `AWS_REGION` (optional; defaults to `ap-southeast-1`)

**Security considerations:**
- Identity & Access Management (IAM) Best Practices
   - To prevent unauthorized access to the broader AWS environment, a dedicated **IAM user** was used with restricted, read-only permissions for Amplify.
   - Dedicated IAM User: A specific service user was created, to be used solely for CI/CD.
   - Policy Definition: A custom JSON policy was attached to the specific service user. This policy explicitly restricts the user to viewing deployment data without the ability to modify or delete resources.
      - **Principle of Least Privilege:** Only grant the absolute minimum permissions required for the task. For monitoring Amplify, this means restricting access to Read operations only (amplify:Get*, amplify:List*), preventing the CI/CD pipeline from accidentally deleting or modifying resources.
   - Permissions:
      - `amplify:GetApp`: Retrieve metadata about the Amplify App
      - `amplify:GetJob`: View specific details of a build/deployment job
      - `amplify:ListJobs`: List recent deployment history
- Secrets Handling and Masking
   - Sensitive credentials were stored in **GitHub Actions Secrets**, which are encrypted at rest and masked in all execution logs.
      - Settings > Secrets and variables > Actions
      - Automatic Masking: GitHub automatically attempts to redact secrets from workflow logs (replacing them with `***`).
   - `AWS_ACCESS_KEY_ID`: The Access Key for the dedicated IAM user
   - `AWS_SECRET_ACCESS_KEY`: The Secret Key for the dedicated IAM user
   - `AWS_REGION`: The AWS region where the Amplify app is hosted (e.g., ap-southeast-1)
   - `AMPLIFY_APP_ID`: The unique ID for the Amplify project

#### **View Workflow Status:**
- **GitHub Actions tab**: See all workflow runs and logs
- **Pull Request**: See check status at bottom of PR description
- **Commit**: See status badge on commits in history
- **Failed checks**: Click to view detailed error logs

#### **Important: Merge Restrictions**
- PRs from `dev` to `main` branch will pass all checks and deploy to production
- PRs from any other branch to `main` branch will fail validation
To release features to production:
1. Merge feature branch → `dev` (auto-deploys to dev stage)
2. Test in dev stage
3. Create PR from `dev` → `main` (only this is allowed)
4. Pass all checks and merge (auto-deploys to prod stage)
## Monitoring deployments
#### On GitHub
1. Go to repo → **Actions** tab
2. Open workflow run **Amplify Deployment Status** for your push to `dev` or `main`
3. Check run result and step summary for branch, deployment status, and URL
4. Pull requests still show CI check status before merge

#### On AWS Amplify Console
1. Go to [Amplify Console](https://console.aws.amazon.com/amplify)
2. Select Go-Or-Not app
3. Click **Deployments** to see:
   - **main** branch → `prod` stage status
   - **dev** branch → `dev` stage status
   - Feature branches → `dev` stage
4. Click a branch to view:
   - Deployment successful / Failed
   - Build and deploy logs
   - Frontend URL 
   - Backend Lambda functions and DynamoDB tables
   - CloudFront caching and error stats
