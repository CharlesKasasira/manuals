CREATE TABLE `ManualShareLink` (
  `id` VARCHAR(191) NOT NULL,
  `manualId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `lastUsedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ManualShareLink_tokenHash_key`(`tokenHash`),
  INDEX `ManualShareLink_manualId_expiresAt_idx`(`manualId`, `expiresAt`),
  INDEX `ManualShareLink_revokedAt_expiresAt_idx`(`revokedAt`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ManualShareLink` ADD CONSTRAINT `ManualShareLink_manualId_fkey` FOREIGN KEY (`manualId`) REFERENCES `Manual`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ManualShareLink` ADD CONSTRAINT `ManualShareLink_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
