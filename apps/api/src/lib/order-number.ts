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
