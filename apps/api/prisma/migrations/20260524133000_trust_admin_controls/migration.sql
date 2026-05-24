ALTER TABLE `Asset` ADD COLUMN `scanStatus` ENUM('pending', 'clean', 'flagged', 'failed') NOT NULL DEFAULT 'pending';
ALTER TABLE `Asset` ADD COLUMN `scanDetails` JSON NULL;
ALTER TABLE `ApiKey` ADD COLUMN `rateLimitPerMinute` INTEGER NOT NULL DEFAULT 60;
