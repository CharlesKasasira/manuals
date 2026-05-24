-- Page-level collaboration: assignees, comments, review notes, section change requests, and mentions.

ALTER TABLE `ManualPage` ADD COLUMN `assignedOwnerId` VARCHAR(191) NULL;

CREATE TABLE `PageComment` (
  `id` VARCHAR(191) NOT NULL,
  `pageId` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `assignedToId` VARCHAR(191) NULL,
  `kind` ENUM('comment', 'reviewer_note', 'change_request') NOT NULL DEFAULT 'comment',
  `status` ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
  `sectionAnchor` VARCHAR(191) NULL,
  `body` TEXT NOT NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolvedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PageCommentMention` (
  `commentId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`commentId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ManualPage_assignedOwnerId_idx` ON `ManualPage`(`assignedOwnerId`);
CREATE INDEX `PageComment_pageId_status_createdAt_idx` ON `PageComment`(`pageId`, `status`, `createdAt`);
CREATE INDEX `PageComment_assignedToId_status_idx` ON `PageComment`(`assignedToId`, `status`);
CREATE INDEX `PageCommentMention_userId_idx` ON `PageCommentMention`(`userId`);

ALTER TABLE `ManualPage` ADD CONSTRAINT `ManualPage_assignedOwnerId_fkey` FOREIGN KEY (`assignedOwnerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `PageComment` ADD CONSTRAINT `PageComment_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `ManualPage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PageComment` ADD CONSTRAINT `PageComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PageComment` ADD CONSTRAINT `PageComment_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `PageComment` ADD CONSTRAINT `PageComment_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `PageCommentMention` ADD CONSTRAINT `PageCommentMention_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `PageComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PageCommentMention` ADD CONSTRAINT `PageCommentMention_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
