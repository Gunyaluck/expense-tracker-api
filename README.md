# Expense Tracker API

Expense Tracker API is a backend coding assignment for a personal income and expense tracking system. It is built with TypeScript, Fastify, PostgreSQL, TypeORM, and Joi.

The API supports account and category management, transaction recording, slip image uploads, report summaries, import/export workflows, monthly budgets, daily spending guidance, and custom session authentication without JWT.

## Feature Summary

- User registration and login
- Custom server-side session authentication without JWT
- Device-aware sessions and logout from all devices
- Account management
- Category management for income and expense records
- Transaction CRUD
- Transaction note support with profanity masking to `***`
- Transaction slip image upload and deletion
- Transaction list filtering by month, year, type, account, category, and date range
- Pagination for list endpoints with page sizes `10`, `20`, `50`, and `100`
- Summary reports grouped by day, month, or year
- Summary export as JSON, CSV, Excel, or Google Sheets-compatible CSV
- Transaction import from JSON, CSV, Excel, or Google Sheets-compatible CSV
- Monthly budget tracking
- Daily spending allowance calculation until the end of the month
- Environment-based configuration through `.env`
- Database migrations
- Docker-based local setup
- Automated tests

## Tech Stack

- TypeScript
- Node.js
- Fastify
- PostgreSQL
- TypeORM
- Joi
- ExcelJS
- csv-parse / csv-stringify
- Node.js built-in test runner
- Docker / Docker Compose

## Project Structure

```txt
src/
  app.ts
  server.ts
  common/
    auth/
    database/
    pagination/
    validation/
  config/
  database/
    entities/
    enums/
    migrations/
  modules/
    accounts/
    auth/
    categories/
    reports/
    sessions/
    transactions/
  tests/
docs/
  backend-design.md
```

`app.ts` builds and configures the Fastify application. `server.ts` only starts the HTTP server. This keeps the app testable because tests can import `buildApp()` without opening a real network port.

## Quick Start With Docker

Docker Compose starts both PostgreSQL and the API. The API image builds the TypeScript project, runs pending migrations, and then starts the server.

```bash
docker compose up --build -d
```

The API will be available at:

```txt
http://localhost:3000
```

Health check:

```txt
GET /health
```

View logs:

```bash
docker compose logs -f api
```

Stop containers:

```bash
docker compose down
```

Remove local Docker data volumes for a clean database and upload storage:

```bash
docker compose down -v
```

Docker Compose defaults:

- PostgreSQL database: `expense_tracker`
- PostgreSQL user: `expense_tracker`
- PostgreSQL password: `expense_tracker`
- API port: `3000`
- Upload volume: `expense_tracker_uploads`

## Local Setup Without Docker

### 1. Install dependencies

```bash
npm install
```

### 2. Create PostgreSQL databases

Create two databases:

- `expense_tracker`
- `expense_tracker_test`

### 3. Configure environment files

Copy the example files:

```bash
cp .env.example .env
cp .env.test.example .env.test
```

Example `.env`:

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgres://<username>:<password>@localhost:5432/expense_tracker
UPLOAD_DIR=uploads
SESSION_SECRET=replace-with-a-long-random-secret
SESSION_COOKIE_SECURE=false
DEFAULT_USER_LOCALE=th
```

### 4. Run migrations

```bash
npm run db:migrate
```

### 5. Start development server

```bash
npm run dev
```

## Available Scripts

- `npm run dev` starts the development server with `tsx watch`
- `npm run build` compiles TypeScript into `dist`
- `npm start` runs the compiled server
- `npm test` runs the automated test suite
- `npm run db:migrate` runs pending migrations
- `npm run db:migrate:prod` runs compiled migrations from `dist`
- `npm run db:migrate:revert` reverts the latest migration

## API Areas

### Auth

```txt
POST /auth/register
POST /auth/login
POST /auth/logout
```

Authentication uses an HttpOnly session cookie. The database stores only the session token hash, not the raw token.

### Sessions

```txt
GET /sessions
DELETE /sessions/:sessionId
DELETE /sessions
```

Sessions include device information such as `deviceId`, `deviceName`, user agent, IP address, status, last activity, and expiry. Users can revoke a single session or log out from all devices.

### Accounts

```txt
POST /accounts
GET /accounts
GET /accounts/:accountId
PATCH /accounts/:accountId
DELETE /accounts/:accountId
```

Delete behavior deactivates an account instead of hard deleting it, so historical transactions and reports remain valid.

### Categories

```txt
POST /categories
GET /categories
GET /categories/:categoryId
PATCH /categories/:categoryId
DELETE /categories/:categoryId
```

Categories are separated by `income` and `expense`. A transaction must use a category whose kind matches the transaction type.

### Transactions

```txt
POST /transactions
GET /transactions
GET /transactions/:transactionId
PATCH /transactions/:transactionId
DELETE /transactions/:transactionId
POST /transactions/:transactionId/attachments
DELETE /transactions/:transactionId/attachments/:attachmentId
POST /transactions/import?format=csv
```

Transaction list filters:

- `month`
- `year`
- `categoryId`
- `accountId`
- `type`
- `fromDate`
- `toDate`
- `page`
- `pageSize`

Slip uploads accept JPEG, PNG, and WEBP images. File metadata is stored in PostgreSQL, while the file itself is stored under `UPLOAD_DIR`.

### Reports

```txt
GET /reports/summary
GET /reports/summary/export
PUT /reports/monthly-budget
GET /reports/daily-allowance
```

Summary reports can be grouped by:

- `day`
- `month`
- `year`

Report filters:

- `month`
- `year`
- `categoryId`
- `accountId`
- `type`
- `fromDate`
- `toDate`

## Import And Export

### Export Summary

```txt
GET /reports/summary/export?groupBy=day&year=2026&month=5&format=csv
```

Supported `format` values:

- `json`
- `csv`
- `excel`
- `googleSheet`

`googleSheet` is implemented as Google Sheets-compatible CSV. This keeps the project testable without requiring Google OAuth or service account credentials during review. The exported CSV can be opened or imported directly in Google Sheets.

### Import Transactions

```txt
POST /transactions/import?format=csv
Content-Type: multipart/form-data
```

Supported `format` values:

- `json`
- `csv`
- `excel`
- `googleSheet`

Expected fields:

```txt
accountId,categoryId,type,amount,occurredAt,note
```

Rules:

- `type` must be `income` or `expense`
- `amount` must be positive
- `occurredAt` must be an ISO date string
- `accountId` must belong to the authenticated user
- `categoryId` must belong to the authenticated user
- category kind must match transaction type

`googleSheet` import expects a CSV export from Google Sheets with the same columns.

## Monthly Budget And Daily Allowance

Set or update monthly budget:

```txt
PUT /reports/monthly-budget
```

Example body:

```json
{
  "year": 2026,
  "month": 5,
  "plannedExpenseLimit": 400
}
```

Calculate daily spending allowance:

```txt
GET /reports/daily-allowance?year=2026&month=5&asOfDate=2026-05-22T00:00:00.000Z&basis=remaining
```

Supported `basis` values:

- `remaining`: calculates from total income minus total expense
- `budget`: calculates from monthly budget minus total expense

Example: if income is `500`, expense is `300`, and there are `10` days left in the month, the remaining basis returns `20.00` per day.

## Validation

Joi validation is applied to request body, query string, and route params across the API. Unknown fields are stripped, values are converted where appropriate, and validation errors return structured error details.

## Database Design

Main tables:

- `users`
- `accounts`
- `categories`
- `monthly_budgets`
- `transactions`
- `transaction_attachments`
- `sessions`

Design choices:

- Monetary values use `numeric(14,2)` instead of floating point
- Runtime schema changes are handled by migrations
- TypeORM `synchronize` is disabled in normal runtime
- Accounts and categories are deactivated instead of hard deleted
- Reports are generated from transaction data as the source of truth
- Session tokens are hashed before storage

## Testing

The automated test suite covers:

- auth
- sessions
- accounts
- categories
- transactions
- transaction attachments
- report summaries
- report export
- transaction import
- monthly budget and daily allowance

Run tests:

```bash
npm test
```

Current verification status:

- `npm run build` passes
- `npm test` passes

## Requirement Coverage

Implemented core requirements:

- login system
- account management
- category management
- expense summary
- filtering by month, year, type, and account
- transaction slip image attachment
- transaction notes
- profanity masking to `***`
- pagination for list responses
- configurable page sizes `10`, `20`, `50`, and `100`

Implemented challenge requirements:

- README documentation
- TypeScript
- `.env` configuration
- request validation for query, payload, and params
- Fastify, TypeORM, and Joi
- export summary to JSON, CSV, Excel, and Google Sheets-compatible CSV
- import transactions from JSON, CSV, Excel, and Google Sheets-compatible CSV
- daily spending allowance until the end of the month
- monthly budget basis for daily allowance
- Thai/English locale field for users
- device-aware sessions and logout from all devices
- Dockerfile and Docker Compose setup
- custom authentication without JWT

## Known Tradeoffs

- Google Sheets support is CSV-compatible instead of direct Google Sheets API integration. This avoids external credential setup and keeps review/testing local.
- File uploads use local disk storage. Production deployment could move this to object storage such as S3.
- Large modules can be split further into service classes if the project grows.
- More negative-path and edge-case tests can be added, especially around import file validation.

## Documentation

- Backend design notes: `docs/backend-design.md`
