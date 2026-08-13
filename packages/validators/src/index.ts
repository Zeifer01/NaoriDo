import { z } from "zod";

/**
 * Accepts absolute http(s) URLs or same-origin local upload paths (`/uploads/...`).
 * Local disk storage returns relative paths so they work on any tenant host.
 */
export const uploadUrlSchema = z
  .string()
  .refine(
    (value) => {
      if (value.startsWith("/uploads/")) return value.length > "/uploads/".length;
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL inválida" },
  );

export const optionalUploadUrlSchema = uploadUrlSchema.optional();
export const nullableUploadUrlSchema = uploadUrlSchema.nullable().optional();

// Auth validators
export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export const registerOrgSchema = z.object({
  organizationName: z.string().min(2, "Nome muito curto").max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
  name: z.string().min(2, "Nome muito curto").max(255),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
  role: z.enum(["org_admin", "branch_manager", "cashier", "waiter", "kitchen"]),
  branchIds: z.array(z.string().uuid()).min(1, "É necessário atribuir pelo menos uma filial"),
});

// Branch validators
export const createBranchSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  timezone: z.string().default("America/Lima"),
  currency: z.string().length(3).default("PEN"),
  taxRate: z.number().int().min(0).max(10000).default(1800),
});

export const updateBranchSchema = createBranchSchema.partial();

// Menu validators
export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  imageUrl: optionalUploadUrlSchema,
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createMenuItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  price: z.number().int().min(0, "O preço não pode ser negativo"),
  comparePriceCents: z.number().int().min(0).nullable().optional(),
  /** Quantity-break promo ("leve N por R$X"). Set both together, or both null to clear. */
  promoQuantity: z.number().int().min(2).nullable().optional(),
  promoPriceCents: z.number().int().min(0).nullable().optional(),
  costCents: z.number().int().min(0).nullable().optional(),
  supplier: z.string().max(255).nullable().optional(),
  /** Internal Code128 barcode; null clears. Empty string treated as null. */
  barcode: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9\-_.]*$/, "Código de barras inválido")
    .nullable()
    .optional(),
  imageUrl: optionalUploadUrlSchema,
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  preparationTimeMin: z.number().int().min(1).max(120).optional(),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();

export const createModifierGroupSchema = z.object({
  name: z.string().min(1).max(255),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  freeQuantity: z.number().int().min(0).default(0),
  allowOutsideCup: z.boolean().default(false),
  outsideCupFeeCents: z.number().int().min(0).default(0),
});

export const createModifierSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().min(1).max(255),
  price: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
});

export const updateModifierGroupSchema = createModifierGroupSchema.partial();
export const updateModifierSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  price: z.number().int().min(0).optional(),
  isAvailable: z.boolean().optional(),
});

// Space validators
export const createSpaceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  floorNumber: z.number().int().min(0).default(1),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateSpaceSchema = createSpaceSchema.partial();

// Table validators
export const createTableSchema = z.object({
  number: z.number().int().min(1),
  capacity: z.number().int().min(1).max(50).default(4),
  spaceId: z.string().uuid().optional(),
});

export const updateTableStatusSchema = z.object({
  status: z.enum(["available", "occupied", "reserved", "maintenance"]),
});

// Customer session (QR flow)
export const startSessionSchema = z.object({
  customerName: z.string().min(1, "Digite seu nome").max(255),
  customerPhone: z.string().max(20).optional(),
});

// Order validators
export const createOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(500).optional(),
  modifiers: z
    .array(
      z.object({
        modifierId: z.string().uuid(),
        outsideCup: z.boolean().optional(),
      }),
    )
    .default([]),
  /** Manual loyalty sticker-card redemption — zeroes this item. Org must have the flag enabled (server-validated). */
  loyaltyDiscount: z.boolean().optional(),
});

export const createOrderBaseSchema = z.object({
  type: z.enum(["dine_in", "takeout", "delivery"]).default("dine_in"),
  customerName: z.string().max(255).optional(),
  customerId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
  customerNotes: z.string().max(1000).optional(),
  deliveryPhone: z.string().max(20).optional(),
  deliveryAddress: z.string().max(500).optional(),
  deliveryReference: z.string().max(255).optional(),
  /** City chosen in cities pricing mode (POS / storefront). */
  deliveryCity: z.string().min(1).max(120).optional(),
  /** Override computed/static delivery fee (cents). */
  deliveryFeeCents: z.number().int().min(0).optional(),
  deliveryFeeStatus: z.enum(["confirmed", "pending"]).optional(),
  paymentMethod: z
    .enum(["cash", "card", "pix", "zelle", "venmo", "cashapp", "transfer", "other", "yape", "plin"])
    .optional(),
  items: z.array(createOrderItemSchema).min(1, "O pedido deve ter pelo menos um item"),
  couponCode: z.string().max(50).optional(),
  redemptionId: z.string().uuid().optional(),
  /** Manual discount (cents) applied by staff at checkout — e.g. bulk-quantity promo tier without automatic pricing support. */
  manualDiscountCents: z.number().int().min(0).optional(),
});

export const createOrderSchema = createOrderBaseSchema.superRefine((data, ctx) => {
  if (data.type === "delivery") {
    if (!data.deliveryAddress || data.deliveryAddress.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryAddress"],
        message: "Informe o endereço de entrega",
      });
    }
  }
});

export const createDeliveryOrderSchema = createOrderBaseSchema
  .extend({
    type: z.literal("delivery").optional(),
    fulfillment: z.enum(["delivery", "pickup"]).default("delivery"),
    customerName: z.string().min(1, "Informe seu nome").max(255),
    deliveryPhone: z.string().min(8, "Informe um telefone válido").max(20),
    deliveryAddress: z.string().max(500).optional(),
    deliveryReference: z.string().max(255).optional(),
    deliveryZoneId: z.string().uuid().optional(),
    /** Selected city from storefront dropdown (cities pricing mode). */
    deliveryCity: z.string().min(1).max(120).optional(),
    paymentMethod: z
      .enum(["cash", "card", "pix", "zelle", "venmo", "cashapp", "transfer", "other"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillment === "delivery") {
      if (!data.deliveryAddress || data.deliveryAddress.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddress"],
          message: "Informe o endereço de entrega",
        });
      }
    }
  });

export const quoteDeliveryFeeSchema = z.object({
  address: z.string().min(5).max(500),
  city: z.string().min(1).max(120).optional(),
});

export const updateOrderDeliverySchema = z.object({
  deliveryAddress: z.string().min(5).max(500).optional(),
  deliveryReference: z.string().max(255).nullable().optional(),
  deliveryCity: z.string().max(120).nullable().optional(),
  deliveryFeeCents: z.number().int().min(0).optional(),
  /** When true, marks fee as confirmed after staff adjustment. */
  confirmFee: z.boolean().optional(),
});

// Delivery zone validators
export const createDeliveryZoneSchema = z.object({
  name: z.string().min(1).max(255),
  feeCents: z.number().int().min(0),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const updateDeliveryZoneSchema = createDeliveryZoneSchema.partial();

export const deliveryRadiusTierSchema = z.object({
  maxMiles: z.number().positive().max(100),
  feeCents: z.number().int().min(0),
});

export const deliveryCityFeeSchema = z.object({
  name: z.string().min(1).max(120),
  feeCents: z.number().int().min(0),
});

export const updateDeliveryPricingSchema = z.object({
  mode: z.enum(["zones", "radius", "cities"]),
  store: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      formattedAddress: z.string().max(500).optional(),
    })
    .nullable()
    .optional(),
  tiers: z.array(deliveryRadiusTierSchema).max(20).optional(),
  cities: z.array(deliveryCityFeeSchema).max(100).optional(),
});

export const geocodeAddressSchema = z.object({
  address: z.string().min(5).max(500),
});

export const previewDeliveryFeeSchema = z.object({
  address: z.string().min(5).max(500),
});

export const deliveryOrderStatusQuerySchema = z.object({
  phone: z.string().min(8, "Informe o telefone usado no pedido"),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "preparing", "ready", "served", "completed", "cancelled"]),
});

export const updateOrderItemStatusSchema = z.object({
  status: z.enum(["pending", "preparing", "ready", "served"]),
});

// Edição de itens em pedidos existentes (Fase B)
export const addOrderItemSchema = createOrderItemSchema;

export const updateOrderItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(99).optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((data) => data.quantity !== undefined || data.notes !== undefined, {
    message: "Informe quantidade ou observação para atualizar",
  });

export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;
export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;

// Payment validators
export const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum([
    "cash",
    "card",
    "yape",
    "plin",
    "pix",
    "zelle",
    "venmo",
    "cashapp",
    "transfer",
    "other",
  ]),
  amount: z.number().int().min(1),
  reference: z.string().max(255).optional(),
  tip: z.number().int().min(0).default(0),
});

// Invoice validators
export const createInvoiceSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(["boleta", "factura"]),
  customerName: z.string().min(1).max(255),
  customerDocType: z.enum(["dni", "ruc", "ce"]),
  customerDocNumber: z.string().min(8).max(20),
});

// Inventory validators
export const createInventoryItemSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  unit: z.string().min(1).max(50),
  currentStock: z.number().min(0).default(0),
  minStock: z.number().min(0).default(0),
  costPerUnit: z.number().int().min(0).default(0),
});

export const createInventoryMovementSchema = z.object({
  itemId: z.string().uuid(),
  type: z.enum(["purchase", "consumption", "waste", "adjustment"]),
  quantity: z.number(),
  reference: z.string().max(255).optional(),
  notes: z.string().max(500).optional(),
});

// Loyalty validators
export const createLoyaltyProgramSchema = z.object({
  name: z.string().min(1).max(255),
  pointsPerCurrencyUnit: z.number().int().min(1).default(1),
  currencyPerPoint: z.number().int().min(1).default(100),
  isActive: z.boolean().default(true),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  birthDate: z.string().optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  neighborhood: z.string().max(120).optional(),
  zipCode: z.string().max(20).optional(),
  state: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const importCustomersSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        phone: z.string().min(5).max(30),
        email: z
          .string()
          .max(255)
          .optional()
          .refine((v) => !v || v.trim() === "" || z.string().email().safeParse(v).success, {
            message: "E-mail inválido",
          }),
        address: z.string().max(500).optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .min(1)
    .max(5000),
});

// Report validators (legacy v1)
export const reportQuerySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  branchId: z.string().uuid().optional(),
});

// Analytics / BI query (reports v2)
export const analyticsQuerySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  compareStartDate: z.string().optional(),
  compareEndDate: z.string().optional(),
  orgWide: z.coerce.boolean().optional(),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ID param
export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// Super Admin validators (Fase 1: gestão de empresas)
export const planValuesSchema = z.enum(["free", "starter", "pro", "enterprise"]);

export const superAdminCreateOrgSchema = z.object({
  organizationName: z.string().min(2, "Nome muito curto").max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan: planValuesSchema.default("free"),
  branchName: z.string().min(2).max(255).default("Sede Principal"),
  branchSlug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens")
    .optional(),
  branchTimezone: z.string().default("America/Sao_Paulo"),
  branchCurrency: z.string().length(3).default("BRL"),
  branchTaxRate: z.number().int().min(0).max(10000).default(0),
  adminName: z.string().min(2).max(255),
  adminEmail: z.string().email("E-mail inválido"),
  adminPassword: z.string().min(8, "Mínimo de 8 caracteres").max(255),
});

export const superAdminUpdateOrgSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens")
    .optional(),
  plan: planValuesSchema.optional(),
  isActive: z.boolean().optional(),
  logoUrl: nullableUploadUrlSchema,
  // ISO 8601 date string (e.g. "2026-12-31T23:59:59.000Z") or null to clear.
  planExpiresAt: z.string().datetime().nullable().optional(),
});

export const superAdminRecordPaymentSchema = z.object({
  // How many days to extend the plan starting from the latest of (now, current
  // plan_expires_at). 30 is the natural default for monthly billing.
  extendDays: z.number().int().min(1).max(3650).default(30),
  // Optional free-form note (e.g. "PIX recebido 19/06") that we record in the
  // org's settings.billing_history so you have an audit trail.
  note: z.string().max(500).optional(),
  amountCents: z.number().int().min(0).optional(),
});

export type SuperAdminRecordPaymentInput = z.infer<typeof superAdminRecordPaymentSchema>;

export const superAdminCreateUserSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8).max(255),
  name: z.string().min(2).max(255),
  role: z.enum(["org_admin", "branch_manager", "cashier", "waiter", "kitchen"]).default("org_admin"),
  branchIds: z.array(z.string().uuid()).default([]),
});

export const superAdminUpdateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  role: z.enum(["org_admin", "branch_manager", "cashier", "waiter", "kitchen"]).optional(),
  isActive: z.boolean().optional(),
  branchIds: z.array(z.string().uuid()).optional(),
});

export const superAdminResetPasswordSchema = z.object({
  password: z.string().min(8, "Mínimo de 8 caracteres").max(255),
});

export type SuperAdminCreateOrgInput = z.infer<typeof superAdminCreateOrgSchema>;
export type SuperAdminUpdateOrgInput = z.infer<typeof superAdminUpdateOrgSchema>;
export type SuperAdminCreateUserInput = z.infer<typeof superAdminCreateUserSchema>;
export type SuperAdminUpdateUserInput = z.infer<typeof superAdminUpdateUserSchema>;
export type SuperAdminResetPasswordInput = z.infer<typeof superAdminResetPasswordSchema>;

// Settings validators
export const updateOrgSettingsSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  logoUrl: nullableUploadUrlSchema,
  settings: z.record(z.unknown()).optional(),
});

export const createOrganizationDomainSchema = z.object({
  hostname: z
    .string()
    .min(3)
    .max(255)
    .transform((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .replace(/:\d+$/, ""),
    )
    .refine((h) => /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h), "Hostname inválido"),
  isPrimary: z.boolean().optional(),
  markVerified: z.boolean().optional(),
});

export const updateBranchSettingsSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  taxRate: z.number().int().min(0).max(10000).optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  settings: z.record(z.unknown()).optional(),
  inventoryEnabled: z.boolean().optional(),
  waiterTableAssignmentEnabled: z.boolean().optional(),
  deliveryEnabled: z.boolean().optional(),
  deliveryFeeCents: z.number().int().min(0).optional(),
  tablesEnabled: z.boolean().optional(),
  landingEnabled: z.boolean().optional(),
  landingTitle: z.string().max(255).optional(),
  landingDescription: z.string().max(2000).optional(),
  landingButtonText: z.string().max(100).optional(),
  landingButtonUrl: z.string().max(500).optional(),
  socialInstagram: z.string().max(500).optional(),
  socialTiktok: z.string().max(500).optional(),
  socialWhatsapp: z.string().max(500).optional(),
  menuDisplayName: z.string().max(255).optional(),
  menuSubtitle: z.string().max(255).optional(),
  menuDeliveryText: z.string().max(255).optional(),
  deliveryOfflineMessage: z.string().max(1000).optional(),
  /** When true, customers can choose pickup/retirada at checkout. */
  pickupEnabled: z.boolean().optional(),
  /**
   * When false, the "Entrega" (delivery) fulfillment option is hidden at
   * checkout and only pickup is offered — distinct from `deliveryEnabled`,
   * which turns the whole online cardápio off.
   */
  deliveryFulfillmentEnabled: z.boolean().optional(),
  pickupAddress: z.string().max(500).optional(),
  pickupHint: z.string().max(255).optional(),
  pickupUnavailableMessage: z.string().max(500).optional(),
  deliveryLabel: z.string().max(80).optional(),
  pickupLabel: z.string().max(80).optional(),
  /** Checkout payment methods shown on the public storefront. */
  paymentMethods: z
    .array(z.enum(["cash", "card", "pix", "zelle", "venmo", "cashapp", "transfer", "other"]))
    .min(1)
    .max(10)
    .optional(),
});

// Query validators for GET endpoints
export const orderQuerySchema = z.object({
  /** Single status or comma-separated list (e.g. pending,confirmed,preparing). */
  status: z
    .string()
    .optional()
    .refine((v) => {
      if (!v) return true;
      const allowed = new Set([
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "served",
        "completed",
        "cancelled",
      ]);
      return v.split(",").every((p) => allowed.has(p.trim()));
    }, "Invalid order status filter"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Channel filter — 'pos' or 'online'. Omitted = no filtering by channel. */
  source: z.enum(["pos", "online"]).optional(),
});

export const inventoryQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
});

export const movementQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
});

export const customerSearchSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const couponQuerySchema = z.object({
  status: z.enum(["active", "inactive", "expired"]).optional(),
  type: z.enum(["percentage", "fixed", "item_free", "item_discount", "category_discount", "buy_x_get_y"]).optional(),
});

export const kitchenQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "preparing", "ready"]).optional(),
});

// Export types inferred from schemas
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;
export type CreateModifierInput = z.infer<typeof createModifierSchema>;
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateDeliveryOrderInput = z.infer<typeof createDeliveryOrderSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type CreateInventoryMovementInput = z.infer<typeof createInventoryMovementSchema>;
export type CreateLoyaltyProgramInput = z.infer<typeof createLoyaltyProgramSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type ImportCustomersInput = z.infer<typeof importCustomersSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;
export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;
export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
export type UpdateBranchSettingsInput = z.infer<typeof updateBranchSettingsSchema>;
export type OrderQueryInput = z.infer<typeof orderQuerySchema>;
