export type Role = "user" | "manager" | "admin";
export type ManualStatus = "draft" | "in_review" | "approved" | "published" | "archived";
export type Visibility = "public" | "internal" | "private" | "restricted";
export type PermissionAction = "read" | "contribute" | "review" | "publish" | "administer";
export type PageCommentKind = "comment" | "reviewer_note" | "change_request";
export type PageCommentStatus = "open" | "resolved";

export type Collaborator = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type PageComment = {
  id: string;
  pageId: string;
  authorId: string;
  assignedToId?: string | null;
  kind: PageCommentKind;
  status: PageCommentStatus;
  sectionAnchor?: string | null;
  body: string;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: Collaborator;
  assignedTo?: Collaborator | null;
  resolvedBy?: Collaborator | null;
  mentions?: Array<{ user: Collaborator }>;
};

export type ManualPage = {
  id: string;
  manualId: string;
  parentId?: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  status: ManualStatus;
  publishedMarkdown?: string | null;
  draftMarkdown?: string | null;
  publishedContentHtml?: string | null;
  draftContentHtml?: string | null;
  assignedOwnerId?: string | null;
  assignedOwner?: Collaborator | null;
  comments?: PageComment[];
  children?: ManualPage[];
  updatedAt?: string;
};

export type Manual = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  status: ManualStatus;
  visibility: Visibility;
  version: number;
  reviewState: string;
  viewCount: number;
  updatedAt: string;
  publishedAt?: string | null;
  lastReviewedAt?: string | null;
  nextReviewDueAt?: string | null;
  owner?: { id: string; name: string; email: string; role: Role };
  space?: { id: string; name: string; slug: string };
  tags?: Array<{ id: string; name: string; slug: string; color?: string }>;
  pages?: ManualPage[];
  tableOfContents?: ManualPage[];
  knowledgeSignals?: {
    pageCount: number;
    publishedPageCount: number;
    draftPageCount: number;
    emptyPageCount: number;
    wordCount: number;
    readingTimeMinutes: number;
    reviewDueStatus: "not_scheduled" | "overdue" | "due_soon" | "current";
    daysUntilReview: number | null;
    daysSinceReview: number | null;
    qualityScore?: number;
  };
};

export type ReviewRequest = {
  id: string;
  decision: "submitted" | "approved" | "changes_requested";
  comment?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  manual?: Manual;
  requestedBy?: { id: string; name: string };
  reviewer?: { id: string; name: string } | null;
};

export type Asset = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  kind: "image" | "document" | "config" | "diagram" | "video" | "other";
  visibility: Visibility;
  scanStatus?: "pending" | "clean" | "flagged" | "failed";
  scanDetails?: Record<string, unknown> | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string; email: string } | null;
  usages?: AssetUsage[];
};

export type AssetUsage = {
  id: string;
  manualId?: string | null;
  pageId?: string | null;
  context?: string | null;
  manual?: Manual | null;
  page?: ManualPage | null;
};

export type AuditLog = {
  id: string;
  event: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string; role: Role } | null;
};

export type Space = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type ManualAnalytics = {
  manual?: Pick<Manual, "id" | "title" | "viewCount" | "version" | "status"> | null;
  feedbackTotal: number;
  helpful: number;
  bookmarks: number;
  follows: number;
};

export type SearchFacet = {
  value: string;
  label: string;
  count: number;
};

export type SearchMatchedPage = {
  id: string;
  title: string;
  slug: string;
  snippet: string;
  score: number;
};

export type SearchManual = Manual & {
  type: "manual";
  matchedPages: SearchMatchedPage[];
  rank: {
    score: number;
    reasons: string[];
  };
};

export type SearchAsset = Asset & {
  type: "asset";
  snippet: string;
  rank: {
    score: number;
    reasons: string[];
  };
};

export type SearchResponse = {
  query: string;
  manuals: SearchManual[];
  assets: SearchAsset[];
  facets: {
    spaces: SearchFacet[];
    tags: SearchFacet[];
    visibility: SearchFacet[];
    types: SearchFacet[];
  };
};

export type AdminOverview = {
  users: AdminUser[];
  teams: Team[];
  spaces: Space[];
  permissions: PermissionGrant[];
  apiAccess: ApiAccess;
  manuals: Array<Pick<Manual, "id" | "title" | "slug">>;
  roles: Role[];
  permissionActions: PermissionAction[];
  auditLogs: AuditLog[];
  pendingNotifications: number;
  roleCounts: Partial<Record<Role, number>>;
  mailSettings: MailSettings;
};

export type AdminSystemInfo = {
  application: {
    name: string;
    version: string;
    environment: string;
    apiUrl?: string | null;
    uploadRoot: string;
  };
  runtime: {
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    pid: number;
  };
  database: {
    provider: string;
    version?: string | null;
    databaseName?: string | null;
    status: string;
    error?: string;
  };
  host: {
    operatingSystem: string;
    platform: string;
    hostname: string;
    cpuCores: number;
    totalRamBytes: number;
    freeRamBytes: number;
    workingDirectory: string;
    configurationFile?: string | null;
  };
};

export type MailSettings = {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  host: string;
  port: number;
  clientHostname?: string;
  secure: boolean;
  verifySsl: boolean;
  username?: string;
  hasPassword: boolean;
  configured: boolean;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  teamMemberships?: Array<{ role: string; team: Pick<Team, "id" | "name" | "slug"> }>;
};

export type Team = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  owner?: { id: string; name: string; email: string } | null;
  members?: Array<{ role: string; user: AdminUser }>;
  permissions?: PermissionGrant[];
};

export type PermissionGrant = {
  id: string;
  action: PermissionAction;
  role?: Role | null;
  createdAt: string;
  manual?: Pick<Manual, "id" | "title" | "slug">;
  user?: { id: string; name: string; email: string } | null;
  team?: { id: string; name: string; slug: string } | null;
};

export type ApiAccess = {
  enabled: boolean;
  keys: ApiKey[];
};

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  role: Role;
  isActive: boolean;
  rateLimitPerMinute?: number;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdBy?: { id: string; name: string; email: string } | null;
  key?: string;
};
