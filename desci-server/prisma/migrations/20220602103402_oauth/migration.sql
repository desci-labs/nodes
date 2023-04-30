-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "expiredAt" SET DEFAULT '2001-01-01 00:00:00';

-- AlterTable
ALTER TABLE "MagicLink" ALTER COLUMN "expiresAt" SET DEFAULT now() + '1 hour';

-- CreateTable
CREATE TABLE "OauthAccessToken" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "applicationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scopes" JSONB NOT NULL DEFAULT E'[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthAccessGrant" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "applicationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallengeMethod" TEXT,
    "codeChallenge" TEXT,
    "scopes" JSONB NOT NULL DEFAULT E'[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUris" JSONB NOT NULL DEFAULT E'[]',
    "scopes" JSONB NOT NULL DEFAULT E'[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grants" JSONB NOT NULL DEFAULT E'[]',

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OauthAccessToken.token_unique" ON "OauthAccessToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OauthAccessToken.refreshToken_unique" ON "OauthAccessToken"("refreshToken");

-- CreateIndex
CREATE INDEX "OauthAccessToken.applicationId_index" ON "OauthAccessToken"("applicationId");

-- CreateIndex
CREATE INDEX "OauthAccessToken.userId_index" ON "OauthAccessToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthAccessGrant.token_unique" ON "OauthAccessGrant"("token");

-- CreateIndex
CREATE INDEX "OauthAccessGrant.applicationId_index" ON "OauthAccessGrant"("applicationId");

-- CreateIndex
CREATE INDEX "OauthAccessGrant.userId_index" ON "OauthAccessGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthApplication.clientId_unique" ON "OauthApplication"("clientId");

-- CreateIndex
CREATE INDEX "UserIdentity.userId_index" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity.provider_uid_unique" ON "UserIdentity"("provider", "uid");

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD FOREIGN KEY ("applicationId") REFERENCES "OauthApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessGrant" ADD FOREIGN KEY ("applicationId") REFERENCES "OauthApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessGrant" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
