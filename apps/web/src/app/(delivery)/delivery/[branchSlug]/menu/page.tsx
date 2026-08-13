"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Leaf, Minus, Plus, ShoppingBag } from "lucide-react";
import { formatCurrency, cn, resolveUploadUrl } from "@/lib/utils";
import { useDeliveryStore } from "@/stores/delivery-store";
import { useDeliveryCartStore } from "@/stores/delivery-cart-store";
import { DeliveryLogo } from "@/app/(delivery)/_components/delivery-logo";
import { useDeliveryTheme } from "@/app/(delivery)/_components/delivery-theme-provider";
import {
  CATEGORY_BG_VARS,
  parseDeliveryThemeId,
} from "@/app/(delivery)/_components/delivery-theme";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const ALL_PRODUCTS = "all";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_price_cents?: number | null;
  image_url?: string | null;
  category_id: string;
  total_sold?: number;
  /** True when item has complement / modifier groups — must open product page. */
  has_modifiers?: boolean;
  promo_quantity?: number | null;
  promo_price_cents?: number | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface MenuData {
  branch: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    tax_rate: number;
    delivery_fee: number;
    logo_url?: string | null;
    org_name?: string | null;
    menu_display_name?: string | null;
    menu_subtitle?: string | null;
    menu_delivery_text?: string | null;
    all_products_tab_sort_order?: number | null;
    menu_theme?: string | null;
    pickup_enabled?: boolean;
    delivery_fulfillment_enabled?: boolean;
    pickup_address?: string | null;
    pickup_hint?: string | null;
    pickup_unavailable_message?: string | null;
    pickup_label?: string | null;
    menu_default_all_items?: boolean;
    menu_group_by_category?: boolean;
  };
  categories: Category[];
  items: MenuItem[];
}

export default function DeliveryMenuPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = use(params);
  const router = useRouter();
  const setBranch = useDeliveryStore((s) => s.setBranch);
  const { setThemeId } = useDeliveryTheme();
  const { addItem, updateQuantity, items, getItemCount } = useDeliveryCartStore();

  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_PRODUCTS);

  const loadMenu = useCallback(() => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    void fetch(`${API_URL}/api/delivery/${branchSlug}/menu`)
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) {
          setErrorCode(result.error?.code ?? null);
          setError(result.error?.message || "Erro ao carregar cardápio");
          setLoading(false);
          return;
        }
        setMenuData(result.data);
        setThemeId(parseDeliveryThemeId(result.data.branch.menu_theme));
        setBranch({
          branchSlug,
          branchName: result.data.branch.name,
          orgName: result.data.branch.org_name ?? result.data.branch.name,
          logoUrl: result.data.branch.logo_url ?? null,
          taxRate: result.data.branch.tax_rate || 0,
          currency: result.data.branch.currency || "BRL",
          deliveryFee: result.data.branch.delivery_fee || 1200,
        });
        const cats: Category[] = result.data.categories ?? [];
        const sorted = [...cats].sort((a, b) => a.sort_order - b.sort_order);
        setActiveCategory(
          result.data.branch.menu_default_all_items ? ALL_PRODUCTS : (sorted[0]?.id ?? ALL_PRODUCTS),
        );
        setLoading(false);
      })
      .catch(() => {
        setError("Erro inesperado ao carregar cardápio");
        setLoading(false);
      });
  }, [branchSlug, setBranch, setThemeId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const sortedCategories = useMemo(
    () =>
      menuData
        ? [...menuData.categories].sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [menuData],
  );

  const activeBg = useMemo(() => {
    if (activeCategory === ALL_PRODUCTS) return "var(--d-bg)";
    const idx = sortedCategories.findIndex((c) => c.id === activeCategory);
    return CATEGORY_BG_VARS[idx % CATEGORY_BG_VARS.length] ?? "var(--d-bg)";
  }, [activeCategory, sortedCategories]);

  const categoryOrder = useMemo(
    () => new Map(sortedCategories.map((category, index) => [category.id, index])),
    [sortedCategories],
  );

  const visibleItems = useMemo(() => {
    if (!menuData) return [];

    const byOrder = (a: MenuItem, b: MenuItem) => {
      const sa = (a as any).sort_order ?? 0;
      const sb = (b as any).sort_order ?? 0;
      if (sa !== sb) {
        if (sa === 0) return 1;
        if (sb === 0) return -1;
        return sa - sb;
      }
      return (b.total_sold ?? 0) - (a.total_sold ?? 0);
    };

    if (activeCategory === ALL_PRODUCTS) {
      if (menuData.branch.menu_group_by_category) {
        // "Todos" grouped by category order (as configured in the categories list),
        // items within each category keep their own byOrder ranking.
        return [...menuData.items].sort((a, b) => {
          const ca = categoryOrder.get(a.category_id) ?? Number.MAX_SAFE_INTEGER;
          const cb = categoryOrder.get(b.category_id) ?? Number.MAX_SAFE_INTEGER;
          if (ca !== cb) return ca - cb;
          return byOrder(a, b);
        });
      }
      return [...menuData.items].sort(byOrder);
    }

    return [...menuData.items]
      .filter((item) => item.category_id === activeCategory)
      .sort(byOrder);
  }, [menuData, activeCategory, categoryOrder]);

  const getCartQty = (menuItemId: string) =>
    items
      .filter((i) => i.menuItemId === menuItemId)
      .reduce((sum, i) => sum + i.quantity, 0);

  const customizePath = (itemId: string) =>
    `/delivery/${branchSlug}/menu/${itemId}`;

  const removeOneFromCart = (menuItemId: string) => {
    const lines = items.filter((i) => i.menuItemId === menuItemId);
    if (lines.length === 0) return;
    const last = lines[lines.length - 1]!;
    updateQuantity(last.lineId, last.quantity - 1);
  };

  /** Plain items (no complements) can quick-add; cups with modifiers always open the wizard. */
  const handleAddClick = (item: MenuItem) => {
    if (item.has_modifiers) {
      router.push(customizePath(item.id));
      return;
    }
    const existingLine = items.find(
      (i) => i.menuItemId === item.id && i.modifiers.length === 0,
    );
    if (existingLine) {
      updateQuantity(existingLine.lineId, existingLine.quantity + 1);
    } else {
      addItem({
        menuItemId: item.id,
        name: item.name,
        unitPrice: item.price,
        quantity: 1,
        modifiers: [],
        promoQuantity: item.promo_quantity,
        promoPriceCents: item.promo_price_cents,
      });
    }
  };

  const cartCount = getItemCount();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--d-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--d-accent)]" />
      </div>
    );
  }

  if (error || !menuData) {
    if (errorCode === "DELIVERY_DISABLED") {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[var(--d-bg)] px-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--d-bg-soft)]">
            <ShoppingBag className="h-8 w-8 text-[var(--d-accent)]" />
          </div>
          <div className="max-w-sm space-y-2">
            <h1 className="text-lg font-semibold text-[var(--d-text)]">Pedidos temporariamente suspensos</h1>
            <p className="text-sm leading-relaxed text-[var(--d-text-soft)]" style={{ whiteSpace: "pre-line" }}>
              {error}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--d-bg)] px-6 text-center">
        <p className="text-sm text-[var(--d-text-soft)]">{error || "Cardápio indisponível"}</p>
        <button
          type="button"
          onClick={loadMenu}
          className="rounded-full bg-[var(--d-accent)] px-6 py-2.5 text-sm font-medium text-[var(--d-on-accent)]"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const currency = menuData.branch.currency;
  const displayName = menuData.branch.menu_display_name || menuData.branch.org_name || menuData.branch.name;
  const menuSubtitle = menuData.branch.menu_subtitle || "Peça online e receba onde estiver";
  const deliveryText = menuData.branch.menu_delivery_text || `Entrega · ${formatCurrency(menuData.branch.delivery_fee || 1200, currency)}`;
  const deliveryFulfillmentEnabled = menuData.branch.delivery_fulfillment_enabled !== false;
  const pickupEnabled = menuData.branch.pickup_enabled !== false;
  const pickupLabel = menuData.branch.pickup_label || "Retirada";
  const pickupStatusText = pickupEnabled
    ? menuData.branch.pickup_hint ||
      (menuData.branch.pickup_address
        ? `${pickupLabel} · ${menuData.branch.pickup_address}`
        : `${pickupLabel} disponível`)
    : menuData.branch.pickup_unavailable_message ||
      `No momento não estamos aceitando ${pickupLabel.toLowerCase()}`;

  return (
    <div
      className="min-h-[100dvh] text-[var(--d-text)] -mx-0"
      style={{ backgroundColor: activeBg, transition: "background-color 0.3s ease" }}
    >
      <header className="relative overflow-hidden bg-gradient-to-b from-[var(--d-hero-from)] to-[var(--d-hero-to)] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[var(--d-purple)]/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-8 top-20 h-28 w-28 rounded-full bg-[var(--d-accent)]/10 blur-2xl" />

        <div className="relative mx-auto flex max-w-lg items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <DeliveryLogo
              logoUrl={menuData.branch.logo_url}
              alt={displayName}
              size="lg"
              className="mb-3 p-2 shadow-sm backdrop-blur-sm"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--d-text-strong)]">
              {displayName}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--d-text-muted)]">
              {menuSubtitle}
            </p>
            {deliveryFulfillmentEnabled && (
              <p className="mt-2 inline-flex items-center rounded-full bg-[var(--d-card)] px-3 py-1 text-xs text-[var(--d-text-soft)] ring-1 ring-[var(--d-border-soft)] whitespace-pre-line">
                {deliveryText}
              </p>
            )}
            <p
              className={`mt-2 inline-flex max-w-full items-center rounded-full px-3 py-1 text-xs ring-1 whitespace-pre-line ${
                pickupEnabled
                  ? "bg-[var(--d-bg-soft)] text-[var(--d-accent-dark)] ring-[var(--d-border-soft)]"
                  : "bg-[var(--d-bg-elevated)] text-[var(--d-text-muted)] ring-[var(--d-border)]"
              }`}
            >
              {pickupStatusText}
            </p>
          </div>

          <Link
            href={`/delivery/${branchSlug}/cart`}
            className="relative mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--d-card)] text-[var(--d-accent-dark)] shadow-sm ring-1 ring-[var(--d-border-soft)] transition active:scale-95"
            aria-label="Ver carrinho"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--d-accent)] px-1 text-[10px] font-bold text-[var(--d-on-accent)]">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {(sortedCategories.length > 0 || (menuData?.items.length ?? 0) > 0) && (
        <div
          className="sticky top-0 z-20 border-b border-[var(--d-border)]/80 backdrop-blur-md"
          style={{
            backgroundColor: `color-mix(in srgb, ${activeBg} 90%, transparent)`,
            transition: "background-color 0.3s ease",
          }}
        >
          <div className="mx-auto max-w-lg px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(() => {
                const allProductsIndex =
                  typeof menuData.branch.all_products_tab_sort_order === "number"
                    ? Math.min(menuData.branch.all_products_tab_sort_order, sortedCategories.length)
                    : sortedCategories.length;
                const allBtn = (
                  <button
                    key={ALL_PRODUCTS}
                    type="button"
                    onClick={() => setActiveCategory(ALL_PRODUCTS)}
                    className={cn(
                      "shrink-0 snap-start rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95",
                      activeCategory === ALL_PRODUCTS
                        ? "bg-[var(--d-accent)] text-[var(--d-on-accent)] shadow-sm"
                        : "bg-[var(--d-bg-elevated)] text-[var(--d-text-soft)] hover:bg-[var(--d-bg-soft)]",
                    )}
                  >
                    Todos os produtos
                  </button>
                );
                const catBtns = sortedCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "shrink-0 snap-start rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95",
                      activeCategory === cat.id
                        ? "bg-[var(--d-accent)] text-[var(--d-on-accent)] shadow-sm"
                        : "bg-[var(--d-bg-elevated)] text-[var(--d-text-soft)] hover:bg-[var(--d-bg-soft)]",
                    )}
                  >
                    {cat.name}
                  </button>
                ));
                return [...catBtns.slice(0, allProductsIndex), allBtn, ...catBtns.slice(allProductsIndex)];
              })()}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-lg px-4 py-5 pb-[max(6rem,env(safe-area-inset-bottom))]">
        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--d-border)] bg-[var(--d-bg-elevated)]/50 px-6 py-12 text-center">
            <Leaf className="mx-auto mb-3 h-8 w-8 text-[var(--d-placeholder)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--d-text-muted)]">
              {activeCategory === ALL_PRODUCTS
                ? "Nenhum produto disponível no cardápio"
                : "Nenhum produto disponível nesta categoria"}
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {visibleItems.map((item) => {
              const qty = getCartQty(item.id);
              const itemImage = resolveUploadUrl(item.image_url) ?? item.image_url;

              return (
                <li
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-[var(--d-border)] bg-[var(--d-card)] shadow-[0_2px_16px_-4px_var(--d-shadow)]"
                >
                  <Link
                    href={`/delivery/${branchSlug}/menu/${item.id}`}
                    className="flex gap-0 sm:gap-0"
                  >
                    <div className="relative h-28 w-28 shrink-0 bg-[var(--d-bg-elevated)] sm:h-32 sm:w-32">
                      {itemImage ? (
                        <Image
                          src={itemImage}
                          alt={item.name}
                          fill
                          className="object-cover"
                          unoptimized
                          sizes="128px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[var(--d-placeholder)]">
                          <Leaf className="h-8 w-8" strokeWidth={1.25} />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
                      <p className="font-medium leading-snug text-[var(--d-text-strong)]">
                        {item.name}
                      </p>
                      {item.promo_quantity && item.promo_price_cents && (
                        <p className="mt-0.5 text-xs font-semibold text-[var(--d-accent-dark)]">
                          Leve {item.promo_quantity} por {formatCurrency(item.promo_price_cents, currency)}
                        </p>
                      )}
                      {item.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--d-text-muted)]">
                          {item.description}
                        </p>
                      )}
                      <div className="mt-2">
                        {item.compare_price_cents && item.compare_price_cents > item.price ? (
                          <>
                            <p className="text-xs leading-none text-[var(--d-placeholder)] line-through">
                              {formatCurrency(item.compare_price_cents, currency)} nas lojas
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-base font-semibold text-[var(--d-accent-dark)]">
                                {formatCurrency(item.price, currency)}
                              </p>
                              <span className="rounded-full bg-[var(--d-bg-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--d-purple)]">
                                -{Math.round((1 - item.price / item.compare_price_cents) * 100)}%
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-base font-semibold text-[var(--d-accent-dark)]">
                            {formatCurrency(item.price, currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center justify-end gap-2 border-t border-[var(--d-bg-elevated)] px-4 py-3">
                    {qty > 0 ? (
                      <div className="flex items-center gap-3 rounded-full bg-[var(--d-bg-soft)] px-1 py-1">
                        <button
                          type="button"
                          aria-label="Remover um"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--d-card-solid)] text-[var(--d-accent-dark)] shadow-sm transition active:scale-95 touch-manipulation"
                          onClick={() => removeOneFromCart(item.id)}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-sm font-semibold text-[var(--d-text)]">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label={
                            item.has_modifiers
                              ? "Adicionar outro com complementos"
                              : "Adicionar um"
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--d-accent)] text-[var(--d-on-accent)] shadow-sm transition active:scale-95 touch-manipulation"
                          onClick={() => handleAddClick(item)}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddClick(item)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--d-accent)] px-5 text-sm font-medium text-[var(--d-on-accent)] shadow-sm transition active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--d-border)] bg-[var(--d-bg)]/95 px-4 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              onClick={() => router.push(`/delivery/${branchSlug}/cart`)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--d-accent)] py-3.5 text-base font-semibold text-[var(--d-on-accent)] shadow-lg transition active:scale-[0.99]"
            >
              <ShoppingBag className="h-5 w-5" />
              Ver carrinho · {cartCount} {cartCount === 1 ? "item" : "itens"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
