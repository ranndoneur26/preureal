-- v37.1 — Passkeys (WebAuthn): credenciales de acceso sin contraseña.
-- Migración 100% ADITIVA. `id` = credential ID base64url (PK, no cuid:
-- lo genera el autenticador). counter = anti-clonado.
CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasskeyCredential_userId" ON "PasskeyCredential"("userId");
ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
