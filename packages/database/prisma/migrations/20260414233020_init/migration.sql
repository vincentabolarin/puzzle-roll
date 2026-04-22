-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('sudoku', 'queens', 'zip', 'tango', 'nonogram', 'minesweeper', 'kakuro', 'light_up', 'futoshiki', 'hitori');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard', 'expert');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationHour" INTEGER NOT NULL DEFAULT 8,
    "timezoneOffsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hapticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoRemoveNotes" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameType" "GameType" NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "gamesCompleted" INTEGER NOT NULL DEFAULT 0,
    "bestTime" INTEGER,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedDate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePuzzle" (
    "id" TEXT NOT NULL,
    "gameType" "GameType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "puzzleData" JSONB NOT NULL,
    "solution" JSONB NOT NULL,
    "seed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPuzzle" (
    "id" TEXT NOT NULL,
    "gameType" "GameType" NOT NULL,
    "date" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "dailyPuzzleId" TEXT,
    "gameType" "GameType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "isDaily" BOOLEAN NOT NULL DEFAULT false,
    "elapsedSeconds" INTEGER NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareableResult" TEXT,

    CONSTRAINT "GameCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_deviceId_key" ON "User"("deviceId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deviceId_idx" ON "User"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UserSettings_userId_idx" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE INDEX "UserStats_userId_idx" ON "UserStats"("userId");

-- CreateIndex
CREATE INDEX "UserStats_gameType_idx" ON "UserStats"("gameType");

-- CreateIndex
CREATE UNIQUE INDEX "UserStats_userId_gameType_key" ON "UserStats"("userId", "gameType");

-- CreateIndex
CREATE INDEX "GamePuzzle_gameType_difficulty_idx" ON "GamePuzzle"("gameType", "difficulty");

-- CreateIndex
CREATE INDEX "GamePuzzle_gameType_idx" ON "GamePuzzle"("gameType");

-- CreateIndex
CREATE INDEX "DailyPuzzle_gameType_date_idx" ON "DailyPuzzle"("gameType", "date");

-- CreateIndex
CREATE INDEX "DailyPuzzle_date_idx" ON "DailyPuzzle"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPuzzle_gameType_date_key" ON "DailyPuzzle"("gameType", "date");

-- CreateIndex
CREATE INDEX "GameCompletion_userId_idx" ON "GameCompletion"("userId");

-- CreateIndex
CREATE INDEX "GameCompletion_puzzleId_idx" ON "GameCompletion"("puzzleId");

-- CreateIndex
CREATE INDEX "GameCompletion_dailyPuzzleId_idx" ON "GameCompletion"("dailyPuzzleId");

-- CreateIndex
CREATE INDEX "GameCompletion_gameType_completedAt_idx" ON "GameCompletion"("gameType", "completedAt");

-- CreateIndex
CREATE INDEX "GameCompletion_isDaily_gameType_completedAt_idx" ON "GameCompletion"("isDaily", "gameType", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameCompletion_userId_puzzleId_key" ON "GameCompletion"("userId", "puzzleId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPuzzle" ADD CONSTRAINT "DailyPuzzle_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "GamePuzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCompletion" ADD CONSTRAINT "GameCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCompletion" ADD CONSTRAINT "GameCompletion_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "GamePuzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCompletion" ADD CONSTRAINT "GameCompletion_dailyPuzzleId_fkey" FOREIGN KEY ("dailyPuzzleId") REFERENCES "DailyPuzzle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
