"use client";

import { Button } from "@restai/ui/components/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@restai/ui/components/tabs";
import { RefreshCw } from "lucide-react";
import {
  useCategories,
  useMenuItems,
  useModifierGroups,
} from "@/hooks/use-menu";
import { useBranchSettings } from "@/hooks/use-settings";
import { PageHeader } from "@/components/page-header";
import { DeliveryMenuLink } from "@/components/delivery-menu-link";
import { ProductsPainel } from "./_components/products-panel";
import { ModifierGroupsPainel } from "./_components/modifier-groups-panel";

export default function MenuPage() {
  const { data: branchData } = useBranchSettings();
  const deliveryEnabled = branchData?.settings?.delivery_enabled !== false;

  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
  } = useCategories();
  const {
    data: menuItems,
    isLoading: itemsLoading,
    error: itemsError,
    refetch: refetchItems,
  } = useMenuItems();
  const { data: modifierGroups } = useModifierGroups();

  const isLoading = categoriesLoading || itemsLoading;
  const error = categoriesError || itemsError;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Cardápio</h1>
        </div>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">
            Erro ao carregar o cardápio: {(error as Error).message}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchCategories();
              refetchItems();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cardápio"
        description="Gerencie categorias, produtos e modificadores"
      />

      {deliveryEnabled && branchData?.slug && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <DeliveryMenuLink branchSlug={branchData.slug} />
        </div>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="modifiers">Modificadores</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsPainel
            categories={categories ?? []}
            menuItems={menuItems ?? []}
            allModifierGroups={modifierGroups ?? []}
            isLoading={isLoading}
          />
        </TabsContent>
        <TabsContent value="modifiers">
          <ModifierGroupsPainel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
