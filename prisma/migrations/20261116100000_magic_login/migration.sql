-- v46 — Magic link (entrada sense contrasenya) per al flux email-first del
-- formulari de la Home. Tokens d'un sol ús (15 min); a la BD només el HASH.
CREATE TABLE "MagicToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "returnTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MagicToken_token_key" ON "MagicToken"("token");
CREATE INDEX "MagicToken_userId_idx" ON "MagicToken"("userId");
CREATE INDEX "MagicToken_expiresAt_idx" ON "MagicToken"("expiresAt");

ALTER TABLE "MagicToken" ADD CONSTRAINT "MagicToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
