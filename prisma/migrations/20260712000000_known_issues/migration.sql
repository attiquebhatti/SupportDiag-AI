-- CreateTable
CREATE TABLE `KnownIssue` (
    `id` VARCHAR(191) NOT NULL,
    `vendor` VARCHAR(191) NOT NULL,
    `product` VARCHAR(191) NOT NULL,
    `issueId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `minAffectedVersion` VARCHAR(191) NULL,
    `maxAffectedVersion` VARCHAR(191) NULL,
    `fixedVersion` VARCHAR(191) NULL,
    `symptomPatternsJson` JSON NOT NULL,
    `requiredEvidenceJson` JSON NULL,
    `exclusionCriteriaJson` JSON NULL,
    `sourceReference` TEXT NOT NULL,
    `remediation` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KnownIssue_issueId_key`(`issueId`),
    INDEX `KnownIssue_vendor_product_idx`(`vendor`, `product`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnownIssueMatch` (
    `id` VARCHAR(191) NOT NULL,
    `uploadId` VARCHAR(191) NOT NULL,
    `knownIssueId` VARCHAR(191) NOT NULL,
    `matchType` VARCHAR(191) NOT NULL,
    `confidence` INTEGER NOT NULL,
    `evidenceJson` JSON NOT NULL,
    `explanation` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KnownIssueMatch_uploadId_idx`(`uploadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `KnownIssueMatch` ADD CONSTRAINT `KnownIssueMatch_uploadId_fkey` FOREIGN KEY (`uploadId`) REFERENCES `Upload`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnownIssueMatch` ADD CONSTRAINT `KnownIssueMatch_knownIssueId_fkey` FOREIGN KEY (`knownIssueId`) REFERENCES `KnownIssue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
