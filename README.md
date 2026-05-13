# Expense Tracker API

Expense Tracker API is a backend coding assignment built with TypeScript, Fastify, PostgreSQL, and TypeORM.

The project focuses on practical backend fundamentals expected in a junior backend interview setting:

- API design
- request validation
- session-based authentication
- relational data modeling
- transaction workflows
- file upload handling
- reporting queries
- automated testing

## Features

- User registration and login
- Account management
- Category management
- Transaction CRUD
- Transaction slip image upload and deletion
- Profanity masking in transaction notes
- Filterable transaction listing
- Summary reports grouped by day, month, or year
- Pagination support for list endpoints

## Tech Stack

- TypeScript
- Fastify
- PostgreSQL
- TypeORM
- Joi
- Node.js built-in test runner

## Project Structure

```txt
src/
  app.ts
  server.ts
  common/
  config/
  database/
  modules/
    auth/
    accounts/
    categories/
    transactions/
    reports/
  tests/
```

The application entry is intentionally split into two files:

- `app.ts` builds the Fastify app, registers plugins, and mounts routes
- `server.ts` starts the HTTP server with `listen()`

This structure makes the application easier to test because the test suite can import `buildApp()` directly without opening a real network port.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create PostgreSQL databases

Create two local databases:

- `expense_tracker`
- `expense_tracker_test`

### 3. Configure environment files

Create `.env` and `.env.test` from the examples below.

Example `.env`

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgres://<username>:<password>@localhost:5432/expense_tracker
UPLOAD_DIR=uploads
SESSION_SECRET=replace-with-a-long-random-secret
SESSION_COOKIE_SECURE=false
```

Example `.env.test`

```env
NODE_ENV=test
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgres://<username>:<password>@localhost:5432/expense_tracker_test
UPLOAD_DIR=uploads
SESSION_SECRET=replace-with-a-long-random-secret-for-tests-123456
SESSION_COOKIE_SECURE=false
```

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Start the development server

```bash
npm run dev
```

Health check endpoint:

```txt
GET /health
```

## Available Scripts

- `npm run dev` starts the development server
- `npm run build` compiles TypeScript into `dist`
- `npm start` runs the compiled server
- `npm test` runs the automated test suite
- `npm run db:migrate` runs pending migrations
- `npm run db:migrate:revert` reverts the latest migration

## Main API Areas

- `/auth`
  - register
  - login
- `/accounts`
  - create, list, get, update, deactivate
- `/categories`
  - create, list, get, update, deactivate
- `/transactions`
  - create, list, get, update, delete
  - upload attachment
  - delete attachment
- `/reports`
  - summary grouped by `day`, `month`, or `year`

## Testing

The project includes automated tests for:

- auth
- accounts
- categories
- transactions
- transaction attachments
- reports

Run all tests with:

```bash
npm test
```

Current status:

- `npm run build` passes
- `npm test` passes

## Design Decisions

- Session-based authentication is used instead of JWT to match the assignment direction
- Database changes are managed through migrations, with `synchronize` disabled in normal runtime
- `accounts` and `categories` use deactivation behavior through `isActive` instead of hard deletion
- Transaction attachment metadata is stored in PostgreSQL, while files are stored in `UPLOAD_DIR`
- Reports are generated directly from transaction data to keep the transaction table as the source of truth

## Interview Notes

This project is intended to demonstrate:

- clear module-based organization
- practical CRUD implementation
- request validation on core endpoints
- PostgreSQL schema design with migrations
- testable Fastify application structure
- handling of real backend concerns such as file uploads, filtering, and summaries

## Possible Improvements

- add more edge-case and negative-path tests
- extract service and repository layers for larger modules
- refactor long modules such as `transactions.module.ts`
- support object storage such as S3 for attachments
- add report export options such as CSV or Excel
- add monthly budget endpoints and daily spending guidance
- add Docker-based local setup

## Current Scope

Implemented:

- core CRUD flows
- slip upload and deletion
- reporting summary
- migration workflow
- automated tests

Not yet implemented:

- import/export workflows
- object storage integration
- deployment setup
- deeper architectural refactoring
