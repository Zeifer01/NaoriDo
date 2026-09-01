import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@restai/db";
import { enrollCustomer } from "./loyalty.service.js";

type CustomerRow = typeof schema.customers.$inferSelect;
type AddressRow = typeof schema.customerAddresses.$inferSelect;

export type AddressInput = {
  address: string;
  city?: string;
  neighborhood?: string;
  zipCode?: string;
  state?: string;
  country?: string;
  reference?: string;
};

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

  if (address?.trim()) {
    await tx.insert(schema.customerAddresses).values({
      customer_id: customer.id,
      label: "Endereço 1",
      address: address.trim(),
      city: city || null,
      neighborhood: neighborhood || null,
      zip_code: zipCode || null,
      state: state || null,
      country: country || null,
      sort_order: 0,
    });
  }

  const loyalty = await enrollCustomer(
    { customerId: customer.id, organizationId },
    tx,
  );

  return { customer, loyalty };
}

export function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  return digits || undefined;
}

function normalizeText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Normalize for duplicate detection (case/space insensitive). */
export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Overwrite fields when the attendant explicitly selected a customer (or phone match). */
function buildOverwritePatch(
  existing: CustomerRow,
  fields: {
    name?: string;
    phone?: string;
    notes?: string;
  },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.name && fields.name !== existing.name) patch.name = fields.name;
  if (fields.phone !== undefined && fields.phone !== (existing.phone || undefined)) {
    patch.phone = fields.phone || null;
  }
  // Address is never overwritten here — use rememberCustomerAddress.
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
    notes?: string;
  },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.phone && !existing.phone) patch.phone = fields.phone;
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

/**
 * Persist a delivery address on the customer address book.
 * - Never overwrites an existing address line
 * - Skips if the same address (normalized) already exists
 * - Fills customers.address only when still empty (primary)
 */
export async function rememberCustomerAddress(
  customerId: string,
  input: AddressInput,
  txOrDb: DbOrTx = db,
): Promise<{ added: boolean; address?: AddressRow }> {
  const address = normalizeText(input.address);
  if (!address) return { added: false };

  const key = normalizeAddressKey(address);

  const existingRows = await txOrDb
    .select()
    .from(schema.customerAddresses)
    .where(eq(schema.customerAddresses.customer_id, customerId))
    .orderBy(asc(schema.customerAddresses.sort_order), asc(schema.customerAddresses.created_at));

  const [customer] = await txOrDb
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1);

  if (!customer) return { added: false };

  // Migrate legacy primary into book if needed
  let rows = existingRows;
  if (
    rows.length === 0 &&
    customer.address &&
    normalizeText(customer.address)
  ) {
    const [migrated] = await txOrDb
      .insert(schema.customerAddresses)
      .values({
        customer_id: customerId,
        label: "Endereço 1",
        address: customer.address.trim(),
        city: customer.city,
        neighborhood: customer.neighborhood,
        zip_code: customer.zip_code,
        state: customer.state,
        country: customer.country,
        sort_order: 0,
      })
      .returning();
    rows = [migrated];
  }

  if (rows.some((r) => normalizeAddressKey(r.address) === key)) {
    return { added: false };
  }

  // Also treat primary flat field as duplicate even if not yet in book
  if (
    rows.length === 0 &&
    customer.address &&
    normalizeAddressKey(customer.address) === key
  ) {
    return { added: false };
  }

  const nextIndex = rows.length + 1;
  const [inserted] = await txOrDb
    .insert(schema.customerAddresses)
    .values({
      customer_id: customerId,
      label: `Endereço ${nextIndex}`,
      address,
      city: normalizeText(input.city) || null,
      neighborhood: normalizeText(input.neighborhood) || null,
      zip_code: normalizeText(input.zipCode) || null,
      state: normalizeText(input.state) || null,
      country: normalizeText(input.country) || null,
      reference: normalizeText(input.reference) || null,
      sort_order: rows.length,
    })
    .returning();

  // Keep primary flat columns only when empty (never overwrite)
  if (!customer.address) {
    await txOrDb
      .update(schema.customers)
      .set({
        address,
        ...(normalizeText(input.city) && !customer.city
          ? { city: normalizeText(input.city) }
          : {}),
        ...(normalizeText(input.neighborhood) && !customer.neighborhood
          ? { neighborhood: normalizeText(input.neighborhood) }
          : {}),
        ...(normalizeText(input.zipCode) && !customer.zip_code
          ? { zip_code: normalizeText(input.zipCode) }
          : {}),
        ...(normalizeText(input.state) && !customer.state
          ? { state: normalizeText(input.state) }
          : {}),
        ...(normalizeText(input.country) && !customer.country
          ? { country: normalizeText(input.country) }
          : {}),
      })
      .where(eq(schema.customers.id, customerId));
  }

  return { added: true, address: inserted };
}

export async function listCustomerAddresses(
  customerId: string,
): Promise<AddressRow[]> {
  return db
    .select()
    .from(schema.customerAddresses)
    .where(eq(schema.customerAddresses.customer_id, customerId))
    .orderBy(asc(schema.customerAddresses.sort_order), asc(schema.customerAddresses.created_at));
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

export class CustomerNotFoundError extends Error {
  constructor(message = "Cliente não encontrado") {
    super(message);
    this.name = "CustomerNotFoundError";
  }
}

/** Partial update — only provided fields are changed. Scoped to organizationId. */
export async function updateCustomer(params: {
  customerId: string;
  organizationId: string;
  name?: string;
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
}): Promise<CustomerRow> {
  const { customerId, organizationId, ...fields } = params;

  const updateData: Partial<CustomerRow> = {};
  if (fields.name !== undefined) updateData.name = fields.name;
  if (fields.email !== undefined) updateData.email = fields.email || null;
  if (fields.phone !== undefined) updateData.phone = fields.phone || null;
  if (fields.birthDate !== undefined) updateData.birth_date = fields.birthDate || null;
  if (fields.address !== undefined) updateData.address = fields.address || null;
  if (fields.city !== undefined) updateData.city = fields.city || null;
  if (fields.neighborhood !== undefined) updateData.neighborhood = fields.neighborhood || null;
  if (fields.zipCode !== undefined) updateData.zip_code = fields.zipCode || null;
  if (fields.state !== undefined) updateData.state = fields.state || null;
  if (fields.country !== undefined) updateData.country = fields.country || null;
  if (fields.notes !== undefined) updateData.notes = fields.notes || null;

  const [updated] = await db
    .update(schema.customers)
    .set(updateData)
    .where(
      and(
        eq(schema.customers.id, customerId),
        eq(schema.customers.organization_id, organizationId),
      ),
    )
    .returning();

  if (!updated) {
    throw new CustomerNotFoundError();
  }
  return updated;
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
  reference?: string;
  notes?: string;
}) {
  const {
    organizationId,
    name,
    email,
    birthDate,
    address,
    city,
    neighborhood,
    zipCode,
    state,
    country,
    reference,
    notes,
  } = params;
  const phone = normalizePhone(params.phone) || params.phone.trim();

  const phoneDigits = normalizePhone(phone) || phone;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.organization_id, organizationId),
          sql`regexp_replace(coalesce(${schema.customers.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`,
        ),
      )
      .limit(1);

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (email && !existing.email) patch.email = email;
      if (birthDate && !existing.birth_date) patch.birth_date = birthDate;
      if (notes && !existing.notes) patch.notes = notes;
      // Never overwrite address fields — append via rememberCustomerAddress

      let customer = existing;
      if (Object.keys(patch).length > 0) {
        const [updated] = await tx
          .update(schema.customers)
          .set(patch)
          .where(eq(schema.customers.id, existing.id))
          .returning();
        customer = updated;
      }

      if (address?.trim()) {
        await rememberCustomerAddress(
          customer.id,
          { address, city, neighborhood, zipCode, state, country, reference },
          tx,
        );
        const [refreshed] = await tx
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.id, customer.id))
          .limit(1);
        if (refreshed) customer = refreshed;
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

    if (address?.trim() && reference?.trim()) {
      // insertAndEnroll already created Endereço 1; update reference if provided
      await tx
        .update(schema.customerAddresses)
        .set({ reference: reference.trim() })
        .where(eq(schema.customerAddresses.customer_id, result.customer.id));
    }

    return { ...result, isNew: true };
  });
}

/**
 * Safe upsert for POS/Caixa:
 * 1) selected customerId → overwrite name/phone/notes (not address)
 * 2) phone match → same
 * 3) exactly one name match → link + fill empty only
 * 4) many name matches / no match → create new
 * Delivery address is always appended via rememberCustomerAddress (never overwrite).
 */
export async function upsertCustomerFromPos(params: {
  organizationId: string;
  name: string;
  customerId?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  city?: string | null;
  reference?: string | null;
}): Promise<{ customer: CustomerRow; isNew: boolean }> {
  const organizationId = params.organizationId;
  const name = normalizeText(params.name) || "Cliente PDV";
  const phone = normalizePhone(params.phone);
  const address = normalizeText(params.address);
  const notes = normalizeText(params.notes);
  const city = normalizeText(params.city);
  const reference = normalizeText(params.reference);
  const selectedId = params.customerId || undefined;

  return db.transaction(async (tx) => {
    let customer: CustomerRow | null = null;
    let isNew = false;

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
        customer = await applyPatch(
          tx,
          selected.id,
          buildOverwritePatch(selected, { name, phone, notes }),
        );
      }
    }

    // 2) Phone match (digit-normalized)
    if (!customer && phone) {
      const [byPhone] = await tx
        .select()
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.organization_id, organizationId),
            sql`regexp_replace(coalesce(${schema.customers.phone}, ''), '[^0-9]', '', 'g') = ${phone}`,
          ),
        )
        .limit(1);

      if (byPhone) {
        customer = await applyPatch(
          tx,
          byPhone.id,
          buildOverwritePatch(byPhone, { name, phone, notes }),
        );
      }
    }

    // 3) Exact name match (case-insensitive)
    if (!customer) {
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
        customer = await applyPatch(
          tx,
          only.id,
          buildFillEmptyPatch(only, { phone, notes }),
        );
      }
    }

    // 4) Multiple same name or none → create new
    if (!customer) {
      const created = await insertAndEnroll(tx, {
        organizationId,
        name,
        phone,
        address,
        city,
        notes,
      });
      customer = created.customer;
      isNew = true;
      // insertAndEnroll already stored address if provided
      if (address && reference) {
        await tx
          .update(schema.customerAddresses)
          .set({ reference })
          .where(eq(schema.customerAddresses.customer_id, customer.id));
      }
      return { customer, isNew };
    }

    if (address) {
      await rememberCustomerAddress(
        customer.id,
        { address, city, reference },
        tx,
      );
      const [refreshed] = await tx
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, customer.id))
        .limit(1);
      if (refreshed) customer = refreshed;
    }

    return { customer, isNew };
  });
}

// ---------------------------------------------------------------------------
// Bulk import (CSV → rows)
// ---------------------------------------------------------------------------

export type ImportCustomerRow = {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
};

export async function importCustomers(params: {
  organizationId: string;
  rows: ImportCustomerRow[];
}): Promise<{
  created: number;
  skipped: number;
  errors: Array<{ row: number; name: string; phone: string; reason: string }>;
}> {
  const { organizationId, rows } = params;

  const existing = await db
    .select({ id: schema.customers.id, phone: schema.customers.phone })
    .from(schema.customers)
    .where(eq(schema.customers.organization_id, organizationId));

  const phoneToId = new Map<string, string>();
  for (const c of existing) {
    const key = normalizePhone(c.phone);
    if (key) phoneToId.set(key, c.id);
  }

  let created = 0;
  let skipped = 0;
  const errors: Array<{ row: number; name: string; phone: string; reason: string }> =
    [];

  // Process in chunks to avoid huge transactions
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.transaction(async (tx) => {
      for (let j = 0; j < chunk.length; j++) {
        const rowIndex = i + j + 1;
        const raw = chunk[j];
        const name = normalizeText(raw.name);
        const phone = normalizePhone(raw.phone);
        const email = normalizeText(raw.email) || undefined;
        const address = normalizeText(raw.address);
        const notes = normalizeText(raw.notes);

        if (!name) {
          errors.push({
            row: rowIndex,
            name: raw.name || "",
            phone: raw.phone || "",
            reason: "Nome obrigatório",
          });
          continue;
        }
        if (!phone || phone.length < 5) {
          errors.push({
            row: rowIndex,
            name,
            phone: raw.phone || "",
            reason: "Telefone inválido",
          });
          continue;
        }

        if (phoneToId.has(phone)) {
          skipped++;
          continue;
        }

        try {
          const { customer } = await insertAndEnroll(tx, {
            organizationId,
            name,
            phone,
            email,
            address,
            notes,
          });
          phoneToId.set(phone, customer.id);
          created++;
        } catch (err) {
          errors.push({
            row: rowIndex,
            name,
            phone,
            reason: err instanceof Error ? err.message : "Erro ao criar",
          });
        }
      }
    });
  }

  return { created, skipped, errors };
}

export async function exportCustomersForOrg(organizationId: string) {
  const customers = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      phone: schema.customers.phone,
      email: schema.customers.email,
      address: schema.customers.address,
      city: schema.customers.city,
      neighborhood: schema.customers.neighborhood,
      zip_code: schema.customers.zip_code,
      state: schema.customers.state,
      country: schema.customers.country,
      notes: schema.customers.notes,
      created_at: schema.customers.created_at,
    })
    .from(schema.customers)
    .where(eq(schema.customers.organization_id, organizationId))
    .orderBy(asc(schema.customers.name));

  if (customers.length === 0) {
    return { customers: [], addressByCustomer: new Map<string, AddressRow[]>() };
  }

  const ids = customers.map((c) => c.id);
  const addresses = await db
    .select()
    .from(schema.customerAddresses)
    .where(inArray(schema.customerAddresses.customer_id, ids))
    .orderBy(asc(schema.customerAddresses.sort_order), asc(schema.customerAddresses.created_at));

  const addressByCustomer = new Map<string, AddressRow[]>();
  for (const a of addresses) {
    const list = addressByCustomer.get(a.customer_id) ?? [];
    list.push(a);
    addressByCustomer.set(a.customer_id, list);
  }

  return { customers, addressByCustomer };
}
