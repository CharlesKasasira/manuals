export const USER_ROLES = ["user", "manager", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PUBLIC_ROLE = "guest" as const;
export type ActorRole = UserRole | typeof PUBLIC_ROLE;

export const MANUAL_STATUSES = ["draft", "in_review", "approved", "published", "archived"] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export const PAGE_STATUSES = MANUAL_STATUSES;
export type PageStatus = ManualStatus;

export const VISIBILITY_VALUES = ["public", "internal", "private", "restricted"] as const;
export type Visibility = (typeof VISIBILITY_VALUES)[number];

export const REVIEW_STATES = ["none", "pending", "changes_requested", "approved"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const AUDIT_EVENTS = [
  "user_created",
  "user_updated",
  "role_updated",
  "manual_created",
  "manual_updated",
  "manual_submitted_for_review",
  "manual_approved",
  "manual_published",
  "manual_archived",
  "manual_deleted",
  "asset_uploaded",
  "asset_deleted",
  "permission_changed",
  "visibility_changed",
  "login",
  "logout"
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}
