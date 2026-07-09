-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "analystNote" TEXT,
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "product" TEXT,
ADD COLUMN     "vendor" TEXT;

-- AlterTable
ALTER TABLE "ParsedArtifact" ADD COLUMN     "product" TEXT,
ADD COLUMN     "vendor" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'html';

-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "detectedProduct" TEXT,
ADD COLUMN     "detectedVendor" TEXT,
ADD COLUMN     "detectionConfidence" INTEGER,
ADD COLUMN     "selectedProduct" TEXT,
ADD COLUMN     "selectedVendor" TEXT;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "vendor" TEXT,
    "product" TEXT,
    "hostname" TEXT,
    "serialNumber" TEXT,
    "version" TEXT,
    "model" TEXT,
    "role" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorParser" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "parserName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maturity" TEXT NOT NULL DEFAULT 'low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorParser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticRule" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maturity" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_uploadId_idx" ON "Asset"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorParser_vendor_product_parserName_key" ON "VendorParser"("vendor", "product", "parserName");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticRule_ruleId_key" ON "DiagnosticRule"("ruleId");

-- CreateIndex
CREATE INDEX "DiagnosticRule_vendor_product_idx" ON "DiagnosticRule"("vendor", "product");

-- CreateIndex
CREATE INDEX "Finding_vendor_idx" ON "Finding"("vendor");

-- CreateIndex
CREATE INDEX "Upload_detectedVendor_idx" ON "Upload"("detectedVendor");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
