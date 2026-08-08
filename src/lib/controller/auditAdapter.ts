// Controller V2 — production audit adapter (server-only).
//
// Maps the kernel's ControllerAuditEntry onto the EXISTING writeAuditLog (C7).
// This is the single audit path — the kernel does not write to audit_log itself.
// Server-only (writeAuditLog pulls createAdminClient); NOT exported from the
// controller barrel so the kernel stays client-safe. Production wiring imports
// this explicitly.

import { writeAuditLog } from '@/lib/admin/audit'
import type { AuditActorRole } from '@/lib/admin/audit'
import type { AuditSink, ControllerAuditEntry } from './types'

function actorRole(entry: ControllerAuditEntry): AuditActorRole {
  if (!entry.actor) return 'none'
  if (entry.actor.isOwner) return 'owner'
  return entry.actor.highestRole ?? 'none'
}

/** The real audit sink used in production. Records via C7's writeAuditLog. */
export function createAuditSink(): AuditSink {
  return {
    record(entry) {
      writeAuditLog({
        actorId: entry.actor?.userId ?? 'controller',
        actorEmail: entry.actor?.email ?? 'controller@system',
        actorRole: actorRole(entry),
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        afterState: entry.detail,
      })
    },
  }
}
