/**
 * Promote an existing user to `super_admin` (or demote them back).
 *
 * Usage:
 *   bun run src/promote-super-admin.ts <email>           # promote
 *   bun run src/promote-super-admin.ts <email> --demote  # demote to org_admin
 *
 * The user must already exist (created via /register or via the staff UI).
 * This script never creates orgs or users; it only changes the `role` column.
 *
 * The change is idempotent:
 *   - Re-running on a user already at the desired role just prints a notice.
 *   - All active refresh tokens for the user are revoked, so the next request
 *     forces a fresh login that picks up the new role.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "./index";

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const demote = args.includes("--demote");

  if (!email) {
    console.error("Uso: bun run src/promote-super-admin.ts <email> [--demote]");
    process.exit(1);
  }

  const targetRole = demote ? "org_admin" : "super_admin";

  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user) {
    console.error(`❌ Nenhum usuário encontrado com o e-mail "${email}".`);
    console.error(
      "   Crie a conta primeiro (via /register ou painel) e rode novamente.",
    );
    process.exit(1);
  }

  if (user.role === targetRole) {
    console.log(
      `ℹ️  ${user.email} já está como "${targetRole}". Nada a fazer.`,
    );
    process.exit(0);
  }

  await db
    .update(schema.users)
    .set({ role: targetRole })
    .where(eq(schema.users.id, user.id));

  // Invalidate refresh tokens — next refresh call will force a fresh login
  // that picks up the new role.
  await db
    .delete(schema.refreshTokens)
    .where(eq(schema.refreshTokens.user_id, user.id));

  console.log(
    `✅ ${user.email} agora é "${targetRole}". Faça logout/login para aplicar.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
