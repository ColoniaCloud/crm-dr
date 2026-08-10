-- AlterTable
ALTER TABLE `contacts` ADD COLUMN `bizStatus` ENUM('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY', 'NOT_FOUND') NULL,
    ADD COLUMN `lastVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `lat` DECIMAL(10, 7) NULL,
    ADD COLUMN `lng` DECIMAL(10, 7) NULL,
    ADD COLUMN `phoneE164` VARCHAR(191) NULL,
    ADD COLUMN `phoneStatus` ENUM('UNVERIFIED', 'VALID', 'INVALID_FORMAT', 'NO_WHATSAPP', 'CONFIRMED', 'UNREACHABLE') NOT NULL DEFAULT 'UNVERIFIED',
    ADD COLUMN `placeId` VARCHAR(191) NULL,
    ADD COLUMN `source` ENUM('SCRAPPER', 'MANUAL', 'IMPORT') NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `whatsappStatus` ENUM('UNVERIFIED', 'VALID', 'INVALID_FORMAT', 'NO_WHATSAPP', 'CONFIRMED', 'UNREACHABLE') NOT NULL DEFAULT 'UNVERIFIED';

-- CreateTable
CREATE TABLE `contact_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `field` VARCHAR(191) NOT NULL,
    `oldValue` TEXT NULL,
    `newValue` TEXT NULL,
    `source` ENUM('LIBPHONENUMBER', 'WHATSAPP', 'GOOGLE_PLACES', 'OPERATOR') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPLIED') NOT NULL DEFAULT 'PENDING',
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contact_verifications_contactId_idx`(`contactId`),
    INDEX `contact_verifications_status_idx`(`status`),
    INDEX `contact_verifications_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `contacts_placeId_key` ON `contacts`(`placeId`);

-- CreateIndex
CREATE INDEX `contacts_source_idx` ON `contacts`(`source`);

-- CreateIndex
CREATE INDEX `contacts_phoneStatus_idx` ON `contacts`(`phoneStatus`);

-- CreateIndex
CREATE INDEX `contacts_lastVerifiedAt_idx` ON `contacts`(`lastVerifiedAt`);

-- AddForeignKey
ALTER TABLE `contact_verifications` ADD CONSTRAINT `contact_verifications_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

