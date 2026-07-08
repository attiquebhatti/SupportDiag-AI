-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ENGINEER', 'VIEWER');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'VALID', 'FALSE_POSITIVE', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ENGINEER',
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'startup',
    "retentionDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "originalFilename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "archiveStoragePath" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADED',
    "supportFileType" TEXT,
    "redactByDefault" BOOLEAN NOT NULL DEFAULT true,
    "healthScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "hostname" TEXT,
    "serialNumber" TEXT,
    "model" TEXT,
    "panosVersion" TEXT,
    "deviceType" TEXT,
    "uptime" TEXT,
    "haStatus" TEXT,
    "panoramaManaged" BOOLEAN NOT NULL DEFAULT false,
    "panoramaServer" TEXT,
    "lastCommitStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedFile" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "fileType" TEXT,
    "size" INTEGER NOT NULL,
    "hash" TEXT,
    "content" TEXT,
    "indexed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParsedArtifact" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "parserName" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "sourceFilePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "redacted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Upload_userId_idx" ON "Upload"("userId");

-- CreateIndex
CREATE INDEX "Upload_status_idx" ON "Upload"("status");

-- CreateIndex
CREATE INDEX "Upload_createdAt_idx" ON "Upload"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJob_uploadId_key" ON "AnalysisJob"("uploadId");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_idx" ON "AnalysisJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Device_uploadId_key" ON "Device"("uploadId");

-- CreateIndex
CREATE INDEX "ExtractedFile_uploadId_idx" ON "ExtractedFile"("uploadId");

-- CreateIndex
CREATE INDEX "ExtractedFile_uploadId_indexed_idx" ON "ExtractedFile"("uploadId", "indexed");

-- CreateIndex
CREATE INDEX "ParsedArtifact_uploadId_idx" ON "ParsedArtifact"("uploadId");

-- CreateIndex
CREATE INDEX "ParsedArtifact_uploadId_artifactType_idx" ON "ParsedArtifact"("uploadId", "artifactType");

-- CreateIndex
CREATE INDEX "Finding_uploadId_idx" ON "Finding"("uploadId");

-- CreateIndex
CREATE INDEX "Finding_uploadId_severity_idx" ON "Finding"("uploadId", "severity");

-- CreateIndex
CREATE INDEX "AIConversation_uploadId_idx" ON "AIConversation"("uploadId");

-- CreateIndex
CREATE INDEX "Report_uploadId_idx" ON "Report"("uploadId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedFile" ADD CONSTRAINT "ExtractedFile_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedArtifact" ADD CONSTRAINT "ParsedArtifact_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

