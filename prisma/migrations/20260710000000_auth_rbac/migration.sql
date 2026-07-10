-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authProvider" TEXT NOT NULL DEFAULT 'credentials',
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

