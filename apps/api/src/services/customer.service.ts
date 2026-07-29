import { eq, and, sql } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@restai/db";
import { enrollCustomer } from "./loyalty.service.js";

type CustomerRow = typeof schema.customers.$inferSelect;

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
    address?: string;
    city?: string;
    neighborhood?: string;
    zipCode?: string;
    state?: string;
    country?: string;
    notes?: string;
  },
) {
  const {
    organizationId,
    name,
    email,
    phone,
    birthDate,
    address,
    city,
    neighborhood,
    zipCode,
    state,
    country,
    notes,
  } = params;

  const [customer] = await tx
    .insert(schema.customers)
    .values({
      organization_id: organizationId,
      name,
      email,
      phone,
      birth_date: birthDate,
      address,
      city,
      neighborhood,
      zip_code: zipCode,
      state,
      country,
      notes,
    })
    .returning();

  const loyalty = await enrollCustomer(
    { customerId: customer.id, organizationId },
    tx,
  );

  return { customer, loyalty };
}

function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  return trimmed || undefined;
}

function normalizeText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Overwrite fields when the attendant explicitly selected a customer (or phone match). */
function buildOverwritePatch(
  existing: CustomerRow,
  fields: {
    name?: string;
    phone?: string;
    address?: string;
    notes?: string;
  },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.name && fields.name !== existing.name) patch.name = fields.name;
  if (fields.phone !== undefined && fields.phone !== (existing.phone || undefined)) {
    patch.phone = fields.phone || null;
  }
  if (fields.address !== undefined && fields.address !== (existing.address || undefined)) {
    patch.address = fields.address || null;
  }
  if (fields.notes !== undefined && fields.notes !== (existing.notes || undefined)) {
    patch.notes = fields.notes || null;
  }
  return patch;
}

/** Only fill empty customer fields (safe for ambiguous name match). */
function buildFillEmptyPatch(
  existing: CustomerRow,
  fields: {
    phone?: string;
    address?: string;
    notes?: string;
  },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.phone && !existing.phone) patch.phone = fields.phone;
  if (fields.address && !existing.address) patch.address = fields.address;
  if (fields.notes && !existing.notes) patch.notes = fields.notes;
  return patch;
}

async function applyPatch(
  tx: DbOrTx,
  customerId: string,
  patch: Record<string, unknown>,
): Promise<CustomerRow> {
  if (Object.keys(patch).length === 0) {
    const [row] = await tx
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .limit(1);
    return row;
  }
  const [updated] = await tx
    .update(schema.customers)
    .set(patch)
    .where(eq(schema.customers.id, customerId))
    .returning();
  return updated;
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
  address?: string;
  city?: string;
  neighborhood?: string;
  zipCode?: string;
  state?: string;
  country?: string;
  notes?: string;
}) {
  return db.transaction((tx) => insertAndEnroll(tx, params));
}

// ---------------------------------------------------------------------------
// findOrCreate — dedup by email (preferred) then phone, else create new
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
// findOrCreateByPhone — used by loyalty / delivery storefront
// ---------------------------------------------------------------------------

export async function findOrCreateByPhone(params: {
  organizationId: string;
  phone: string;
  name: string;
  email?: string;
  birthDate?: string;
  address?: string;
  city?: string;
  neighborhood?: string;
  zipCode?: string;
  state?: string;
  country?: string;
  notes?: string;
}) {
  const {
    organizationId,
    phone,
    name,
    email,
    birthDate,
    address,
    city,
    neighborhood,
    zipCode,
    state,
    country,
    notes,
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
      if (address && !existing.address) patch.address = address;
      if (city && !existing.city) patch.city = city;
      if (neighborhood && !existing.neighborhood) patch.neighborhood = neighborhood;
      if (zipCode && !existing.zip_code) patch.zip_code = zipCode;
      if (state && !existing.state) patch.state = state;
      if (country && !existing.country) patch.country = country;
      if (notes && !existing.notes) patch.notes = notes;

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
      address,
      city,
      neighborhood,
      zipCode,
      state,
      country,
      notes,
    });
    return { ...result, isNew: true };
  });
}

/**
 * Safe upsert for POS/Caixa:
 * 1) selected customerId → overwrite form fields on that record
 * 2) phone match → overwrite form fields on that record
 * 3) exactly one name match → link + fill empty only (no overwrite)
 * 4) many name matches / no match → create new
 */
export async function upsertCustomerFromPos(params: {
  organizationId: string;
  name: string;
  customerId?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}): Promise<{ customer: CustomerRow; isNew: boolean }> {
  const organizationId = params.organizationId;
  const name = normalizeText(params.name) || "Cliente PDV";
  const phone = normalizePhone(params.phone);
  const address = normalizeText(params.address);
  const notes = normalizeText(params.notes);
  const selectedId = params.customerId || undefined;

  return db.transaction(async (tx) => {
    // 1) Explicit selection from autocomplete
    if (selectedId) {
      const [selected] = await tx
        .select()
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.id, selectedId),
            eq(schema.customers.organization_id, organizationId),
          ),
        )
        .limit(1);

      if (selected) {
        const customer = await applyPatch(
          tx,
          selected.id,
          buildOverwritePatch(selected, { name, phone, address, notes }),
        );
        return { customer, isNew: false };
      }
      // Invalid id → fall through
    }

    // 2) Phone match
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
        const customer = await applyPatch(
          tx,
          byPhone.id,
          buildOverwritePatch(byPhone, { name, phone, address, notes }),
        );
        return { customer, isNew: false };
      }
    }

    // 3) Exact name match (case-insensitive)
    const nameMatches = await tx
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.organization_id, organizationId),
          sql`lower(trim(${schema.customers.name})) = lower(${name})`,
        ),
      )
      .limit(5);

    if (nameMatches.length === 1) {
      const only = nameMatches[0];
      const customer = await applyPatch(
        tx,
        only.id,
        buildFillEmptyPatch(only, { phone, address, notes }),
      );
      return { customer, isNew: false };
    }

    // 4) Multiple same name or none → create new (never overwrite a homonym)
    const { customer } = await insertAndEnroll(tx, {
      organizationId,
      name,
      phone,
      address,
      notes,
    });
    return { customer, isNew: true };
  });
}
