# Puzzle Roll

A premium cross-platform puzzle app for iOS, Android, and Web featuring daily logic puzzle games. Built with Expo React Native, NestJS, and PostgreSQL.

---

## Architecture

```
puzzle-roll/
├── apps/
│   ├── mobile/          # Expo React Native (iOS, Android, Web)
│   └── api/             # NestJS backend
├── packages/
│   ├── shared/          # Pure TypeScript game engines + shared types
│   ├── ui/              # Shared React Native UI components
│   └── database/        # Prisma schema, migrations, seed scripts
├── turbo.json
├── docker-compose.yml
└── dokploy.yml
```

**Tech stack:** Turborepo · pnpm workspaces · TypeScript strict mode throughout  
**Mobile:** Expo SDK 51 · Expo Router v3 · NativeWind v4 · Zustand · TanStack Query  
**API:** NestJS · Prisma ORM · PostgreSQL · Redis · Bull · Expo Server SDK  
**Infra:** Docker Compose (local) · Dokploy (production) · Netcup VPS

---

## Prerequisites

- Node.js 22+
- pnpm 10+ (`npm install -g pnpm`)
- Docker Desktop (for local PostgreSQL + Redis)
- Expo Go app or iOS/Android simulator
- Xcode (iOS) / Android Studio (Android) for native builds

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/api/.env` with your secrets. The defaults work for local Docker development.

### 3. Start infrastructure

```bash
docker-compose up postgres redis -d
```

### 4. Run database migrations and seed

```bash
pnpm db:migrate
pnpm db:seed
```

The seed script generates:
- 20 puzzles × 4 difficulties × 10 games = **800 puzzles**
- 365 pre-assigned daily puzzles per game (3,650 total assignments)

Seeding takes 3–8 minutes due to uniqueness verification for each puzzle.

### 5. Start development servers

```bash
# All services (API + mobile) in parallel
pnpm dev

# Or individually:
pnpm --filter @puzzle-roll/api dev        # API on :3000
pnpm --filter @puzzle-roll/mobile dev     # Expo dev server
```

---

## Environment Variables

### `apps/api/.env`

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://puzzleroll:puzzleroll@localhost:5432/puzzleroll` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Access token signing secret | — |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | — |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `ADMIN_API_KEY` | Admin endpoint auth key | — |
| `EXPO_ACCESS_TOKEN` | Expo push notification access token | — |

### `apps/mobile/.env`

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API URL | `http://localhost:3000/api` |
| `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID` | AdMob interstitial unit ID | Test ID in dev |
| `EXPO_PUBLIC_ADMOB_REWARDED_ID` | AdMob rewarded unit ID | Test ID in dev |

---

## Database

### Migrations

```bash
# Create a new migration after schema changes
pnpm db:migrate

# Apply migrations in production (non-interactive)
pnpm --filter @puzzle-roll/database db:migrate:deploy

# Open Prisma Studio
pnpm db:studio
```

### Seeding

```bash
pnpm db:seed
```

To reseed from scratch (drops existing puzzle data):
```bash
pnpm --filter @puzzle-roll/database db:reset
```

---

## Puzzle Generators

Each of the 10 games has a pure TypeScript generator in `packages/shared/src/engines/[game]/`:

| Game | Generator | Notes |
|------|-----------|-------|
| Sudoku | `generator.ts` | Backtracking with MRV heuristic, unique-solution verified |
| Queens | `index.ts` | Flood-fill region assignment, uniqueness verified |
| Zip | `index.ts` | Hamiltonian path via DFS, waypoint placement |
| Tango | `index.ts` | Constraint propagation + backtracking, uniqueness verified |
| Nonogram | `index.ts` | Random binary grid, constraint-propagation uniqueness check |
| Minesweeper | `index.ts` | Fresh-generated per session, first-tap safe zone |
| Kakuro | `index.ts` | Layout generation + clue computation from filled solution |
| Light Up | `index.ts` | Greedy bulb placement ensuring full illumination |
| Futoshiki | `index.ts` | Latin square + inequality constraints, uniqueness verified |
| Hitori | `index.ts` | Shaded-cell generation + connectivity + uniqueness verified |

### Using generators directly

```typescript
import { SudokuEngine } from '@puzzle-roll/shared';

// Generate a seeded, reproducible puzzle
const puzzle = SudokuEngine.generatePuzzle('medium', 12345);
console.log(puzzle.puzzleData.grid);  // The puzzle
console.log(puzzle.solution.grid);    // The solution
console.log(puzzle.seed);             // 12345

// Without a seed — random
const random = SudokuEngine.generatePuzzle('hard');
```

All generators accept an optional `seed?: number` for reproducibility in tests.

---

## Testing

```bash
# Run all tests
pnpm test

# Game engine tests only (packages/shared)
pnpm --filter @puzzle-roll/shared test

# API tests only
pnpm --filter @puzzle-roll/api test

# With coverage
pnpm --filter @puzzle-roll/shared test -- --coverage
```

Engine tests cover: valid puzzle generation · solution validation · hint generation · edge cases  
API tests cover: auth service · progress service · unit tests for all services

---

## Running on Devices

### Expo Go (fastest)
```bash
pnpm --filter @puzzle-roll/mobile dev
# Scan QR code with Expo Go app
```

> **Note:** `react-native-google-mobile-ads` requires a development build (not Expo Go). Use test ad IDs during development — they are wired in automatically when `NODE_ENV !== production`.

### Development build (required for AdMob)
```bash
# iOS
pnpm --filter @puzzle-roll/mobile ios

# Android  
pnpm --filter @puzzle-roll/mobile android
```

### Web
```bash
pnpm --filter @puzzle-roll/mobile web
```

---

## Deployment

### Production Docker build

```bash
docker build -f apps/api/Dockerfile -t puzzle-roll-api .
docker run -p 3000:3000 --env-file apps/api/.env puzzle-roll-api
```

### Dokploy (Netcup VPS)

The `dokploy.yml` at the root configures three services:
- `puzzle-roll-api` — the NestJS container
- `puzzle-roll-postgres` — PostgreSQL 16
- `puzzle-roll-redis` — Redis 7

Set the following secrets in your Dokploy environment before deploying:
- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `ADMIN_API_KEY`, `EXPO_ACCESS_TOKEN`
- `POSTGRES_PASSWORD`

The API health check endpoint is `GET /api/health`.

### Mobile (EAS Build)

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

Configure `eas.json` with your Apple and Google credentials before submitting.

---

## API Documentation

Swagger UI is available at `http://localhost:3000/api/docs` in development.

### Key endpoints

```
POST  /api/auth/register          Register with email/password
POST  /api/auth/login             Login
POST  /api/auth/refresh           Refresh access token
POST  /api/auth/anonymous         Create/restore anonymous session
POST  /api/auth/upgrade           Upgrade anonymous → registered account

GET   /api/puzzles/:gameType/daily        Today's daily puzzle
GET   /api/puzzles/:gameType              Paginated puzzle list
GET   /api/puzzles/id/:id                 Get puzzle by ID
GET   /api/puzzles/id/:id/solution        Get puzzle solution

POST  /api/progress/complete              Submit game completion
POST  /api/progress/sync                  Flush offline queue (batch)
GET   /api/progress/user/:userId          Get user progress

GET   /api/leaderboard/:gameType/daily    Daily leaderboard
GET   /api/leaderboard/:gameType/alltime  All-time leaderboard

GET   /api/users/me                       Current user profile + stats
PATCH /api/users/me/notifications         Update push settings + token
PATCH /api/users/me/settings              Update app settings

GET   /api/health                         Health check
```

---

## Push Notifications

Push notifications use Expo's push service on the client and `expo-server-sdk` on the backend.

Two notification types are sent:
1. **Daily reminder** — at user's configured local hour (default 08:00), personalised to their most-played game
2. **Streak nudge** — at 20:00 local time if the user has an active streak ≥ 3 days and hasn't played today

To obtain an Expo access token for production: https://expo.dev/accounts/[account]/settings/access-tokens

---

## AdMob

Test ad unit IDs are automatically used in development:
- Interstitial: `ca-app-pub-3940256099942544/1033173712`
- Rewarded: `ca-app-pub-3940256099942544/5224354917`

For production, set `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID` and `EXPO_PUBLIC_ADMOB_REWARDED_ID` in `apps/mobile/.env`.

Interstitials fire every 3 completions (never during gameplay). Rewarded ads grant one extra hint — if the ad fails to load, the hint is granted anyway.

---

## Project Structure Notes

- **Game engines** (`packages/shared/src/engines/`) are pure TypeScript with zero React or React Native dependencies. They can be imported and tested in any Node.js environment.
- **No `any` types** anywhere. TypeScript strict mode is enforced globally.
- **All components** are under 150 lines. Logic lives in hooks and stores, not components.
- **Offline-first**: all game completions are written locally first and synced in the background. The app is fully playable after the first successful launch.
- **Tablet layout**: detected via `useBreakpoint` hook (768px threshold). Sidebar nav, 3-column home grid, and split game screen activate automatically on tablets.
