import "server-only";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";

export async function audit(actorUserId: string | null, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  if (!isDatabaseConfigured()) return;
  await ensureSchema();
  await db()`insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata) values (${actorUserId}, ${action}, ${entityType}, ${entityId}, ${db().json(JSON.parse(JSON.stringify(metadata)))})`;
}
