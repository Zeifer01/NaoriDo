import { eq, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@restai/db";

export async function allocateOrderNumber(
  tx: DbOrTx,
  branchId: string,
): Promise<string> {
  const [branch] = await tx
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .for("update")
    .limit(1);

  const settings = (branch?.settings || {}) as Record<string, unknown>;
  let next =
    typeof settings.order_sequence_next === "number" && settings.order_sequence_next > 0
      ? settings.order_sequence_next
      : null;

  if (next === null) {
    const [result] = await tx
      .select({
        maxNum: sql<number>`COALESCE(MAX(CASE WHEN ${schema.orders.order_number} ~ '^[0-9]+$' THEN ${schema.orders.order_number}::int END), 0)`,
      })
      .from(schema.orders)
      .where(eq(schema.orders.branch_id, branchId));
    next = (result?.maxNum ?? 0) + 1;
  }

  await tx
    .update(schema.branches)
    .set({
      settings: { ...settings, order_sequence_next: next + 1 },
      updated_at: new Date(),
    })
    .where(eq(schema.branches.id, branchId));

  return String(next);
}

export async function resetBranchOrderSequence(
  tx: DbOrTx,
  branchId: string,
): Promise<void> {
  const [branch] = await tx
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .for("update")
    .limit(1);

  const settings = (branch?.settings || {}) as Record<string, unknown>;

  await tx
    .update(schema.branches)
    .set({
      settings: { ...settings, order_sequence_next: 1 },
      updated_at: new Date(),
    })
    .where(eq(schema.branches.id, branchId));
}

/**
 * Archives the current session's orders by prefixing their order_number
 * (e.g. "42" → "feira1-42"), then increments the session counter and
 * resets the order sequence to 1. No orders are deleted or modified beyond
 * the order_number rename.
 */
export async function archiveCurrentSession(
  tx: DbOrTx,
  branchId: string,
): Promise<{ archivedCount: number; sessionName: string; nextSessionName: string }> {
  const [branch] = await tx
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .for("update")
    .limit(1);

  const settings = (branch?.settings || {}) as Record<string, unknown>;
  const prefix = (settings.order_session_prefix as string | undefined) || "feira";
  const sessionNum = (settings.order_session_number as number | undefined) ?? 1;
  const sessionName = `${prefix}${sessionNum}`;
  const nextSessionName = `${prefix}${sessionNum + 1}`;

  // Prefix only pure-numeric order numbers (skip already-archived ones)
  const updated = await tx
    .update(schema.orders)
    .set({
      order_number: sql`${sessionName + "-"} || ${schema.orders.order_number}`,
    })
    .where(
      and(
        eq(schema.orders.branch_id, branchId),
        sql`${schema.orders.order_number} ~ '^[0-9]+$'`,
      ),
    )
    .returning({ id: schema.orders.id });

  await tx
    .update(schema.branches)
    .set({
      settings: {
        ...settings,
        order_session_number: sessionNum + 1,
        order_sequence_next: 1,
      },
      updated_at: new Date(),
    })
    .where(eq(schema.branches.id, branchId));

  return { archivedCount: updated.length, sessionName, nextSessionName };
}
