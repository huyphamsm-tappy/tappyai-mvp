// entityType/entityId are opaque to the Music Module — it never enumerates or
// imports feature names (reviews, stories, ...); consuming features agree on
// their own entityType string by convention.
export interface MusicUsageRecord {
  id: string
  trackId: string
  entityType: string
  entityId: string
  userId: string | null
  createdAt: string
}
