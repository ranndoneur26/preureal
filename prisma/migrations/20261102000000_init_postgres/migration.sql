-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ca',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PasswordToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Municipality" (
    "code" TEXT NOT NULL,
    "ineCode" TEXT,
    "name" TEXT NOT NULL,
    "comarca" TEXT,
    "province" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "rentLatest" DOUBLE PRECISION,
    "rentPeriod" TEXT,
    "rentPrevYear" DOUBLE PRECISION,
    "rentPrevPeriod" TEXT,
    "rentHistory" TEXT,
    "contractsLatest" INTEGER,
    "isTense" BOOLEAN NOT NULL DEFAULT false,
    "tenseList" TEXT,
    "boundary" TEXT,
    "boundaryFetchedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Building" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ICGC_RTT',
    "municipalityCode" TEXT,
    "tipus" TEXT,
    "estat" TEXT,
    "altura" INTEGER,
    "nom" TEXT,
    "polygonJson" TEXT NOT NULL,
    "centroidLat" DOUBLE PRECISION NOT NULL,
    "centroidLng" DOUBLE PRECISION NOT NULL,
    "refcat" TEXT,
    "yearBuilt" INTEGER,
    "yearSource" TEXT,
    "avgRentEurMonth" DOUBLE PRECISION,
    "sampleSize" INTEGER,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SearchLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "buildingId" TEXT,
    "municipalityCode" TEXT,
    "ipHash" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DETAIL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PriceReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "municipalityCode" TEXT,
    "buildingId" TEXT,
    "offerEurMonth" DOUBLE PRECISION,
    "offerEurM2" DOUBLE PRECISION,
    "surfaceM2" DOUBLE PRECISION,
    "rooms" INTEGER,
    "contractType" TEXT,
    "reportedAt" TIMESTAMP(3),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'sandbox',
    "status" TEXT NOT NULL DEFAULT 'logged',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StripeEvent" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlanSetting" (
    "plan" TEXT NOT NULL,
    "quotaMonth" INTEGER NOT NULL,
    "priceEur" DOUBLE PRECISION NOT NULL,
    "features" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanSetting_pkey" PRIMARY KEY ("plan")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "buildingId" TEXT,
    "municipalityCode" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SavedComparison" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entities" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_plan_idx" ON "User"("plan");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordToken_token_key" ON "PasswordToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailToken_token_key" ON "EmailToken"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Municipality_name_idx" ON "Municipality"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Municipality_isTense_idx" ON "Municipality"("isTense");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Building_externalId_key" ON "Building"("externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Building_municipalityCode_idx" ON "Building"("municipalityCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Building_centroidLat_centroidLng_idx" ON "Building"("centroidLat", "centroidLng");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchLog_userId_createdAt_idx" ON "SearchLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchLog_municipalityCode_idx" ON "SearchLog"("municipalityCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Event_type_createdAt_idx" ON "Event"("type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PriceReport_status_idx" ON "PriceReport"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PriceReport_municipalityCode_createdAt_idx" ON "PriceReport"("municipalityCode", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ImportRun_createdAt_idx" ON "ImportRun"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_entityKey_key" ON "Favorite"("userId", "entityKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SavedComparison_userId_idx" ON "SavedComparison"("userId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "PasswordToken" ADD CONSTRAINT "PasswordToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "PriceReport" ADD CONSTRAINT "PriceReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "SavedComparison" ADD CONSTRAINT "SavedComparison_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

