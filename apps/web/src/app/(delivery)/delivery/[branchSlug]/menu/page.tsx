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
  const { addItem, updateQuantity, items, getItemCount } = useDeliveryCartStore();

  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_PRODUCTS);

  const loadMenu = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetch(`${API_URL}/api/delivery/${branchSlug}/menu`)
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) {
          setError(result.error?.message || "Erro ao carregar cardápio");
          setLoading(false);
          return;
        }
        setMenuData(result.data);
        setBranch({
          branchSlug,
          branchName: result.data.branch.name,
          orgName: result.data.branch.org_name ?? result.data.branch.name,
          logoUrl: result.data.branch.logo_url ?? null,
          taxRate: result.data.branch.tax_rate || 0,
          currency: result.data.branch.currency || "BRL",
          deliveryFee: result.data.branch.delivery_fee || 1200,
        });
        setActiveCategory(ALL_PRODUCTS);
        setLoading(false);
      })
      .catch(() => {
        setError("Erro inesperado ao carregar cardápio");
        setLoading(false);
      });
  }, [branchSlug, setBranch]);

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
      return [...menuData.items].sort(byOrder);
    }

    return [...menuData.items]
      .filter((item) => item.category_id === activeCategory)
      .sort(byOrder);
  }, [menuData, activeCategory, categoryOrder]);

  const getCartQty = (menuItemId: string) =>
    items
      .filter((i) => i.menuItemId === menuItemId && i.modifiers.length === 0)
      .reduce((sum, i) => sum + i.quantity, 0);

  const handleQuickAdd = (item: MenuItem) => {
    addItem({
      menuItemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: 1,
      modifiers: [],
    });
  };

  const cartCount = getItemCount();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#FAF7F2]">
        <Loader2 className="h-8 w-8 animate-spin text-[#7A9B7E]" />
      </div>
    );
  }

  if (error || !menuData) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#FAF7F2] px-6 text-center">
        <p className="text-sm text-[#5C6356]">{error || "Cardápio indisponível"}</p>
        <button
          type="button"
          onClick={loadMenu}
          className="rounded-full bg-[#7A9B7E] px-6 py-2.5 text-sm font-medium text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const currency = menuData.branch.currency;
  const displayName = menuData.branch.menu_display_name || menuData.branch.org_name || menuData.branch.name;
  const menuSubtitle = menuData.branch.menu_subtitle || "Produtos naturais, entregues na sua porta";
  const deliveryText = menuData.branch.menu_delivery_text || `Entrega · ${formatCurrency(menuData.branch.delivery_fee || 1200, currency)}`;

  return (
    <div className="min-h-[100dvh] text-[#3A3F38] -mx-0">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-b from-[#EDF3E8] to-[#FAF7F2] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#E8EFE4]/80 blur-2xl" />
        <div className="pointer-events-none absolute -left-6 top-16 h-24 w-24 rounded-full bg-[#F0EBE3]/90 blur-xl" />

        <div className="relative mx-auto flex max-w-lg items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <DeliveryLogo
              logoUrl={menuData.branch.logo_url}
              alt={displayName}
              size="lg"
              className="mb-3 p-2 shadow-sm backdrop-blur-sm"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-[#2F342E]">
              {displayName}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[#6B7268]">
              {menuSubtitle}
            </p>
            <p className="mt-2 inline-flex items-center rounded-full bg-white/60 px-3 py-1 text-xs text-[#5C6356] ring-1 ring-[#E8EFE4]">
              {deliveryText}
            </p>
          </div>

          <Link
            href={`/delivery/${branchSlug}/cart`}
            className="relative mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#5C7A5F] shadow-sm ring-1 ring-[#E8EFE4] transition active:scale-95"
            aria-label="Ver carrinho"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#7A9B7E] px-1 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Categories — sticky */}
      {(sortedCategories.length > 0 || (menuData?.items.length ?? 0) > 0) && (
        <div className="sticky top-0 z-20 border-b border-[#EDE8DF]/80 bg-[#FAF7F2]/90 backdrop-blur-md">
          <div className="mx-auto max-w-lg px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setActiveCategory(ALL_PRODUCTS)}
                className={cn(
                  "shrink-0 snap-start rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95",
                  activeCategory === ALL_PRODUCTS
                    ? "bg-[#7A9B7E] text-white shadow-sm"
                    : "bg-[#F0EBE3] text-[#5C6356] hover:bg-[#E8EFE4]",
                )}
              >
                Todos os produtos
              </button>
              {sortedCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "shrink-0 snap-start rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95",
                    activeCategory === cat.id
                      ? "bg-[#7A9B7E] text-white shadow-sm"
                      : "bg-[#F0EBE3] text-[#5C6356] hover:bg-[#E8EFE4]",
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Products */}
      <main className="mx-auto max-w-lg px-4 py-5 pb-[max(6rem,env(safe-area-inset-bottom))]">
        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E0DDD4] bg-[#F5F0E8]/50 px-6 py-12 text-center">
            <Leaf className="mx-auto mb-3 h-8 w-8 text-[#A8B5A0]" strokeWidth={1.5} />
            <p className="text-sm text-[#6B7268]">
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
                  className="overflow-hidden rounded-2xl border border-[#EDE8DF] bg-white/80 shadow-[0_2px_16px_-4px_rgba(58,63,56,0.08)]"
                >
                  <Link
                    href={`/delivery/${branchSlug}/menu/${item.id}`}
                    className="flex gap-0 sm:gap-0"
                  >
                    <div className="relative h-28 w-28 shrink-0 bg-[#F0EBE3] sm:h-32 sm:w-32">
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
                        <div className="flex h-full w-full items-center justify-center text-[#A8B5A0]">
                          <Leaf className="h-8 w-8" strokeWidth={1.25} />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
                      <p className="font-medium leading-snug text-[#2F342E]">
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#6B7268]">
                          {item.description}
                        </p>
                      )}
                      <div className="mt-2">
                        {item.compare_price_cents && item.compare_price_cents > item.price ? (
                          <>
                            <p className="text-xs leading-none text-[#A8B5A0] line-through">
                              {formatCurrency(item.compare_price_cents, currency)} nas lojas
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-base font-semibold text-[#5C7A5F]">
                                {formatCurrency(item.price, currency)}
                              </p>
                              <span className="rounded-full bg-[#EDF3E8] px-1.5 py-0.5 text-[10px] font-semibold text-[#5C7A5F]">
                                -{Math.round((1 - item.price / item.compare_price_cents) * 100)}%
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-base font-semibold text-[#5C7A5F]">
                            {formatCurrency(item.price, currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center justify-end gap-2 border-t border-[#F0EBE3] px-4 py-3">
                    {qty > 0 ? (
                      <div className="flex items-center gap-3 rounded-full bg-[#EDF3E8] px-1 py-1">
                        <button
                          type="button"
                          aria-label="Remover um"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#5C7A5F] shadow-sm transition active:scale-95"
                          onClick={() => {
                            const line = items.find(
                              (i) =>
                                i.menuItemId === item.id &&
                                i.modifiers.length === 0,
                            );
                            if (line) updateQuantity(line.lineId, qty - 1);
                          }}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-sm font-semibold text-[#3A3F38]">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label="Adicionar um"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7A9B7E] text-white shadow-sm transition active:scale-95"
                          onClick={() => handleQuickAdd(item)}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleQuickAdd(item)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#7A9B7E] px-5 text-sm font-medium text-white shadow-sm transition active:scale-95"
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

      {/* Floating cart */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#EDE8DF] bg-[#FAF7F2]/95 px-4 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              onClick={() => router.push(`/delivery/${branchSlug}/cart`)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7A9B7E] py-3.5 text-base font-semibold text-white shadow-lg shadow-[#7A9B7E]/25 transition active:scale-[0.99]"
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
