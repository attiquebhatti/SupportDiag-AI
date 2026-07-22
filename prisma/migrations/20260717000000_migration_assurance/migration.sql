-- CreateTable
CREATE TABLE `MigrationProject` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `sourceVendor` VARCHAR(191) NULL,
    `sourcePlatform` VARCHAR(191) NULL,
    `sourceVersion` VARCHAR(191) NULL,
    `targetPlatform` VARCHAR(191) NOT NULL DEFAULT 'panos',
    `targetManagementType` ENUM('STANDALONE_PANOS', 'PANORAMA', 'SCM', 'PRISMA_ACCESS') NOT NULL DEFAULT 'STANDALONE_PANOS',
    `targetVersion` VARCHAR(191) NULL,
    `targetScopeJson` JSON NULL,
    `status` ENUM('DRAFT', 'COLLECTING', 'PARSING', 'VALIDATING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `scoresJson` JSON NULL,
    `completenessJson` JSON NULL,
    `lastValidatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `MigrationProject_userId_idx`(`userId`),
    INDEX `MigrationProject_status_idx`(`status`),
    INDEX `MigrationProject_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConfigurationSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `snapshotType` ENUM('SOURCE', 'MIGRATED', 'TARGET_CANDIDATE', 'TARGET_RUNNING', 'TARGET_EFFECTIVE') NOT NULL,
    `origin` ENUM('UPLOAD', 'GENERATED', 'API_PANOS', 'API_PANORAMA', 'API_SCM', 'SUPPORTDIAG_CASE') NOT NULL DEFAULT 'UPLOAD',
    `format` VARCHAR(191) NOT NULL,
    `originalFilename` VARCHAR(191) NULL,
    `storagePath` VARCHAR(191) NULL,
    `fileHash` VARCHAR(191) NULL,
    `fileSize` INTEGER NULL,
    `version` VARCHAR(191) NULL,
    `scopeJson` JSON NULL,
    `parseStatus` ENUM('PENDING', 'PARSING', 'PARSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `parseError` TEXT NULL,
    `statsJson` JSON NULL,
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `parsedAt` DATETIME(3) NULL,

    INDEX `ConfigurationSnapshot_migrationProjectId_idx`(`migrationProjectId`),
    INDEX `ConfigurationSnapshot_snapshotType_idx`(`snapshotType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NormalizedObject` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotId` VARCHAR(191) NOT NULL,
    `objectType` VARCHAR(191) NOT NULL,
    `originalId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `normalizedName` VARCHAR(191) NOT NULL,
    `vendor` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'shared',
    `parentScope` VARCHAR(191) NULL,
    `ruleOrder` INTEGER NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `dataJson` JSON NOT NULL,
    `sourceReference` VARCHAR(191) NULL,
    `checksum` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NormalizedObject_snapshotId_objectType_idx`(`snapshotId`, `objectType`),
    INDEX `NormalizedObject_snapshotId_normalizedName_idx`(`snapshotId`, `normalizedName`),
    INDEX `NormalizedObject_checksum_idx`(`checksum`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MigrationMapping` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `objectType` VARCHAR(191) NOT NULL,
    `sourceObjectId` VARCHAR(191) NULL,
    `migratedObjectId` VARCHAR(191) NULL,
    `targetObjectId` VARCHAR(191) NULL,
    `sourceName` VARCHAR(191) NULL,
    `migratedName` VARCHAR(191) NULL,
    `targetName` VARCHAR(191) NULL,
    `mappingType` ENUM('ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_ONE', 'SPLIT_RULE', 'CONSOLIDATED_RULE', 'TRANSFORMED_OBJECT', 'UNSUPPORTED_TRANSLATION', 'MANUAL_MAPPING', 'UNMAPPED') NOT NULL DEFAULT 'ONE_TO_ONE',
    `transformationNotes` TEXT NULL,
    `confidence` INTEGER NOT NULL DEFAULT 100,
    `status` ENUM('EXACT_MATCH', 'EQUIVALENT_MATCH', 'TRANSFORMED_MATCH', 'PARTIAL_MATCH', 'MISSING_IN_MIGRATED', 'MISSING_IN_TARGET', 'EXTRA_IN_TARGET', 'CONFLICT', 'UNSUPPORTED', 'REQUIRES_MANUAL_REVIEW', 'NOT_EVALUATED') NOT NULL DEFAULT 'NOT_EVALUATED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MigrationMapping_migrationProjectId_objectType_idx`(`migrationProjectId`, `objectType`),
    INDEX `MigrationMapping_sourceObjectId_idx`(`sourceObjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PolicyComparison` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `policyType` VARCHAR(191) NOT NULL,
    `sourcePolicyId` VARCHAR(191) NULL,
    `migratedPolicyId` VARCHAR(191) NULL,
    `targetPolicyId` VARCHAR(191) NULL,
    `ruleName` VARCHAR(191) NOT NULL,
    `sourceOrder` INTEGER NULL,
    `migratedOrder` INTEGER NULL,
    `targetOrder` INTEGER NULL,
    `sourceToMigrated` ENUM('EXACT_MATCH', 'EQUIVALENT_MATCH', 'TRANSFORMED_MATCH', 'PARTIAL_MATCH', 'MISSING_IN_MIGRATED', 'MISSING_IN_TARGET', 'EXTRA_IN_TARGET', 'CONFLICT', 'UNSUPPORTED', 'REQUIRES_MANUAL_REVIEW', 'NOT_EVALUATED') NOT NULL DEFAULT 'NOT_EVALUATED',
    `migratedToDeployed` ENUM('EXACT_MATCH', 'EQUIVALENT_MATCH', 'TRANSFORMED_MATCH', 'PARTIAL_MATCH', 'MISSING_IN_MIGRATED', 'MISSING_IN_TARGET', 'EXTRA_IN_TARGET', 'CONFLICT', 'UNSUPPORTED', 'REQUIRES_MANUAL_REVIEW', 'NOT_EVALUATED') NOT NULL DEFAULT 'NOT_EVALUATED',
    `endToEndStatus` ENUM('EXACT_MATCH', 'EQUIVALENT_MATCH', 'TRANSFORMED_MATCH', 'PARTIAL_MATCH', 'MISSING_IN_MIGRATED', 'MISSING_IN_TARGET', 'EXTRA_IN_TARGET', 'CONFLICT', 'UNSUPPORTED', 'REQUIRES_MANUAL_REVIEW', 'NOT_EVALUATED') NOT NULL DEFAULT 'NOT_EVALUATED',
    `riskClassification` ENUM('NO_MATERIAL_CHANGE', 'LOW_RISK_DIFFERENCE', 'FUNCTIONAL_DIFFERENCE', 'SECURITY_WEAKENING', 'CONNECTIVITY_RISK', 'CRITICAL_MIGRATION_FAILURE') NOT NULL DEFAULT 'NO_MATERIAL_CHANGE',
    `differencesJson` JSON NULL,
    `confidence` INTEGER NOT NULL DEFAULT 100,
    `scope` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PolicyComparison_migrationProjectId_policyType_idx`(`migrationProjectId`, `policyType`),
    INDEX `PolicyComparison_endToEndStatus_idx`(`endToEndStatus`),
    INDEX `PolicyComparison_riskClassification_idx`(`riskClassification`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationFinding` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `category` ENUM('MIGRATION_FAILURE', 'MIGRATION_DIFFERENCE', 'DEPLOYMENT_FAILURE', 'SECURITY_REGRESSION', 'CONNECTIVITY_RISK', 'OPTIMIZATION_RECOMMENDATION') NOT NULL,
    `severity` ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL') NOT NULL,
    `findingType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityName` VARCHAR(191) NULL,
    `sourceEvidenceJson` JSON NULL,
    `migratedEvidenceJson` JSON NULL,
    `targetEvidenceJson` JSON NULL,
    `impact` TEXT NULL,
    `recommendation` TEXT NULL,
    `remediationJson` JSON NULL,
    `status` ENUM('OPEN', 'ACCEPTED', 'REMEDIATED', 'DEFERRED', 'FALSE_POSITIVE') NOT NULL DEFAULT 'OPEN',
    `analystNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ValidationFinding_migrationProjectId_category_idx`(`migrationProjectId`, `category`),
    INDEX `ValidationFinding_migrationProjectId_severity_idx`(`migrationProjectId`, `severity`),
    INDEX `ValidationFinding_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationTest` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `testType` VARCHAR(191) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 50,
    `inputJson` JSON NOT NULL,
    `expectedResultJson` JSON NULL,
    `actualResultJson` JSON NULL,
    `status` ENUM('NOT_RUN', 'PASSED', 'FAILED', 'INCONCLUSIVE', 'UNSUPPORTED') NOT NULL DEFAULT 'NOT_RUN',
    `notes` TEXT NULL,
    `executedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ValidationTest_migrationProjectId_testType_idx`(`migrationProjectId`, `testType`),
    INDEX `ValidationTest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeploymentValidation` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `targetScope` VARCHAR(191) NULL,
    `deviceIdentifier` VARCHAR(191) NULL,
    `validationStatus` ENUM('NOT_VALIDATED', 'VALIDATION_PASSED', 'VALIDATION_PASSED_WITH_WARNINGS', 'VALIDATION_FAILED', 'COMMIT_PENDING', 'COMMIT_SUCCESSFUL', 'COMMIT_FAILED', 'PUSH_PENDING', 'PUSH_SUCCESSFUL', 'PUSH_PARTIALLY_SUCCESSFUL', 'PUSH_FAILED', 'UNABLE_TO_VERIFY') NOT NULL DEFAULT 'NOT_VALIDATED',
    `commitStatus` ENUM('NOT_VALIDATED', 'VALIDATION_PASSED', 'VALIDATION_PASSED_WITH_WARNINGS', 'VALIDATION_FAILED', 'COMMIT_PENDING', 'COMMIT_SUCCESSFUL', 'COMMIT_FAILED', 'PUSH_PENDING', 'PUSH_SUCCESSFUL', 'PUSH_PARTIALLY_SUCCESSFUL', 'PUSH_FAILED', 'UNABLE_TO_VERIFY') NOT NULL DEFAULT 'NOT_VALIDATED',
    `pushStatus` ENUM('NOT_VALIDATED', 'VALIDATION_PASSED', 'VALIDATION_PASSED_WITH_WARNINGS', 'VALIDATION_FAILED', 'COMMIT_PENDING', 'COMMIT_SUCCESSFUL', 'COMMIT_FAILED', 'PUSH_PENDING', 'PUSH_SUCCESSFUL', 'PUSH_PARTIALLY_SUCCESSFUL', 'PUSH_FAILED', 'UNABLE_TO_VERIFY') NOT NULL DEFAULT 'NOT_VALIDATED',
    `jobId` VARCHAR(191) NULL,
    `detailsJson` JSON NULL,
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeploymentValidation_migrationProjectId_idx`(`migrationProjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MigrationException` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `findingId` VARCHAR(191) NULL,
    `exceptionType` ENUM('ACCEPTED_TRANSFORMATION', 'INTENTIONAL_CHANGE', 'APPROVED_OPTIMIZATION', 'KNOWN_LIMITATION', 'FALSE_POSITIVE', 'REQUIRES_REMEDIATION', 'DEFERRED', 'UNSUPPORTED_SOURCE_FEATURE') NOT NULL,
    `reason` TEXT NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvalStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `ticketReference` VARCHAR(191) NULL,
    `evidenceJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MigrationException_migrationProjectId_idx`(`migrationProjectId`),
    INDEX `MigrationException_findingId_idx`(`findingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MigrationReport` (
    `id` VARCHAR(191) NOT NULL,
    `migrationProjectId` VARCHAR(191) NOT NULL,
    `reportType` VARCHAR(191) NOT NULL,
    `format` VARCHAR(191) NOT NULL DEFAULT 'md',
    `storagePath` VARCHAR(191) NULL,
    `contentHash` VARCHAR(191) NULL,
    `summaryJson` JSON NULL,
    `generatedBy` VARCHAR(191) NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MigrationReport_migrationProjectId_reportType_idx`(`migrationProjectId`, `reportType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MigrationProject` ADD CONSTRAINT `MigrationProject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MigrationProject` ADD CONSTRAINT `MigrationProject_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConfigurationSnapshot` ADD CONSTRAINT `ConfigurationSnapshot_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NormalizedObject` ADD CONSTRAINT `NormalizedObject_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `ConfigurationSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MigrationMapping` ADD CONSTRAINT `MigrationMapping_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PolicyComparison` ADD CONSTRAINT `PolicyComparison_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationFinding` ADD CONSTRAINT `ValidationFinding_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationTest` ADD CONSTRAINT `ValidationTest_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeploymentValidation` ADD CONSTRAINT `DeploymentValidation_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MigrationException` ADD CONSTRAINT `MigrationException_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MigrationException` ADD CONSTRAINT `MigrationException_findingId_fkey` FOREIGN KEY (`findingId`) REFERENCES `ValidationFinding`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MigrationReport` ADD CONSTRAINT `MigrationReport_migrationProjectId_fkey` FOREIGN KEY (`migrationProjectId`) REFERENCES `MigrationProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

