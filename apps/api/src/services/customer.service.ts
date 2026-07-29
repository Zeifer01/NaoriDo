import { eq, and } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@restai/db";
import { enrollCustomer } from "./loyalty.service.js";

// ---------------------------------------------------------------------------
// Internal: insert customer + auto-enroll in loyalty (requires existing tx)
// ---------------------------------------------------------------------------

async function insertAndEnroll(
  tx: DbOrTx,
  params: {
    organizationId: string;
    name: string;
    email?: string;
    phone?: string;
    birthDate?: string;
    city?: string;
    neighborhood?: string;
    zipCode?: string;
    state?: string;
    country?: string;
  },
) {
  const {
    organizationId,
    name,
    email,
    phone,
    birthDate,
    city,
    neighborhood,
    zipCode,
    state,
    country,
  } = params;

  const [customer] = await tx
    .insert(schema.customers)
    .values({
      organization_id: organizationId,
      name,
      email,
      phone,
      birth_date: birthDate,
      city,
      neighborhood,
      zip_code: zipCode,
      state,
      country,
    })
    .returning();

  const loyalty = await enrollCustomer(
    { customerId: customer.id, organizationId },
    tx,
  );

  return { customer, loyalty };
}

// ---------------------------------------------------------------------------
// createCustomer — standalone insert + enroll (own transaction)
// ---------------------------------------------------------------------------

export async function createCustomer(params: {
  organizationId: string;
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  city?: string;
  neighborhood?: string;
  zipCode?: string;
  state?: string;
  country?: string;
}) {
  return db.transaction((tx) => insertAndEnroll(tx, params));
}

// ---------------------------------------------------------------------------
// findOrCreate — dedup by email (preferred) then phone, else create new
// All reads + potential write run in a single transaction.
// ---------------------------------------------------------------------------

export async function findOrCreate(params: {
  organizationId: string;
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
}) {
  const { organizationId, name, email, phone, birthDate } = params;

  return db.transaction(async (tx) => {
    // 1. Search by email (most reliable identifier)
    if (email) {
      const [byEmail] = await tx
        .select()
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.organization_id, organizationId),
            eq(schema.customers.email, email),
          ),
        )
        .limit(1);

      if (byEmail) {
        // Backfill missing fields
        if ((phone && !byEmail.phone) || (birthDate && !byEmail.birth_date)) {
          await tx
            .update(schema.customers)
            .set({
              ...(phone && !byEmail.phone ? { phone } : {}),
              ...(birthDate && !byEmail.birth_date
                ? { birth_date: birthDate }
                : {}),
            })
            .where(eq(schema.customers.id, byEmail.id));
        }
        const [loyalty] = await tx
          .select()
          .from(schema.customerLoyalty)
          .where(eq(schema.customerLoyalty.customer_id, byEmail.id))
          .limit(1);
        return { customer: byEmail, loyalty: loyalty || null, isNew: false };
      }
    }

    // 2. Search by phone
    if (phone) {
      const [byPhone] = await tx
        .select()
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.organization_id, organizationId),
            eq(schema.customers.phone, phone),
          ),
        )
        .limit(1);

      if (byPhone) {
        // Backfill missing fields
        if ((email && !byPhone.email) || (birthDate && !byPhone.birth_date)) {
          await tx
            .update(schema.customers)
            .set({
              ...(email && !byPhone.email ? { email } : {}),
              ...(birthDate && !byPhone.birth_date
                ? { birth_date: birthDate }
                : {}),
            })
            .where(eq(schema.customers.id, byPhone.id));
        }
        const [loyalty] = await tx
          .select()
          .from(schema.customerLoyalty)
          .where(eq(schema.customerLoyalty.customer_id, byPhone.id))
          .limit(1);
        return { customer: byPhone, loyalty: loyalty || null, isNew: false };
      }
    }

    // 3. No match — create new customer + enroll
    const result = await insertAndEnroll(tx, {
      organizationId,
      name,
      email,
      phone,
      birthDate,
    });
    return { ...result, isNew: true };
  });
}

// ---------------------------------------------------------------------------
// findOrCreateByPhone — used by loyalty.ts for phone-based customer lookup
// ---------------------------------------------------------------------------

export async function findOrCreateByPhone(params: {
  organizationId: string;
  phone: string;
  name: string;
  email?: string;
  birthDate?: string;
  city?: string;
  neighborhood?: string;
  zipCode?: string;
  state?: string;
  country?: string;
}) {
  const {
    organizationId,
    phone,
    name,
    email,
    birthDate,
    city,
    neighborhood,
    zipCode,
    state,
    country,
  } = params;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.organization_id, organizationId),
          eq(schema.customers.phone, phone),
        ),
      )
      .limit(1);

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (email && !existing.email) patch.email = email;
      if (birthDate && !existing.birth_date) patch.birth_date = birthDate;
      if (city && !existing.city) patch.city = city;
      if (neighborhood && !existing.neighborhood) patch.neighborhood = neighborhood;
      if (zipCode && !existing.zip_code) patch.zip_code = zipCode;
      if (state && !existing.state) patch.state = state;
      if (country && !existing.country) patch.country = country;

      let customer = existing;
      if (Object.keys(patch).length > 0) {
        const [updated] = await tx
          .update(schema.customers)
          .set(patch)
          .where(eq(schema.customers.id, existing.id))
          .returning();
        customer = updated;
      }

      const [loyaltyInfo] = await tx
        .select()
        .from(schema.customerLoyalty)
        .where(eq(schema.customerLoyalty.customer_id, customer.id))
        .limit(1);
      return { customer, loyalty: loyaltyInfo || null, isNew: false };
    }

    const result = await insertAndEnroll(tx, {
      organizationId,
      name,
      email,
      phone,
      birthDate,
      city,
      neighborhood,
      zipCode,
      state,
      country,
    });
    return { ...result, isNew: true };
  });
}
