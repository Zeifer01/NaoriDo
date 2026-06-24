"use client";

import { useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@restai/ui/components/tabs";
import { AlertTriangle, RefreshCw, Package, ArrowUpDown, Link2, BarChart3 } from "lucide-react";
import {
  useInventoryItems,
  useInventoryMovements,
  useInventoryAlerts,
  useDeleteInventoryItem,
} from "@/hooks/use-inventory";
import { ProjectionTab } from "./_components/projection-tab";
import { useBranchSettings } from "@/hooks/use-settings";
import { PageHeader } from "@/components/page-header";
import { ItemsTab } from "./_components/items-tab";
import { ItemDialog } from "./_components/item-dialog";
import { MovementsTab } from "./_components/movements-tab";
import { CreateMovementDialog } from "./_components/movement-dialog";
import { ProductLinksTab } from "./_components/product-links-tab";
import { ProductLinkDialog } from "./_components/product-link-dialog";
import { toast } from "sonner";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("stock");
  const [search, setSearch] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [newMovementOpen, setNewMovementOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<any>(null);

  const deleteItem = useDeleteInventoryItem();

  const { data: branchData } = useBranchSettings();
  const inventoryEnabled = branchData?.settings?.inventory_enabled ?? false;

  const {
    data: itemsData,
    isLoading,
    error,
    refetch,
  } = useInventoryItems();
  const { data: movementsData } = useInventoryMovements();
  const { data: alertsData } = useInventoryAlerts();

  const items: any[] = itemsData ?? [];
  const movements: any[] = movementsData ?? [];
  const alerts: any[] = alertsData ?? [];

  async function handleDeleteItem(item: any) {
    if (
      !confirm(
        `Excluir "${item.name}"? Vínculos com o cardápio e movimentações deste item também serão removidos.`,
      )
    ) {
      return;
    }
    try {
      await deleteItem.mutateAsync(item.id);
      toast.success("Item excluído");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (!inventoryEnabled && branchData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventário</h1>
          <p className="text-muted-foreground">
            Controle de estoque para produtos orgânicos
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Inventário desativado</p>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              O controle de inventário não está ativado para esta filial. Você pode ativá-lo nas configurações da filial.
            </p>
            <Button variant="outline" onClick={() => window.location.href = "/settings"}>
              Ir para Configurações
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventário</h1>
        </div>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 flex items-center justify-between">
          <p className="text-sm text-destructive">
            Erro ao carregar inventário: {(error as Error).message}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/10 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">
              {alerts.length}{" "}
              {alerts.length === 1 ? "item" : "itens"} abaixo do estoque mínimo
            </p>
            <p className="text-xs text-destructive/80">
              {alerts.map((a: any) => a.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      <PageHeader
        title="Inventário"
        description={
          isLoading
            ? "Carregando..."
            : `${items.length} itens no total`
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stock">
            <Package className="h-4 w-4 mr-1" />
            Itens
          </TabsTrigger>
          <TabsTrigger value="projection">
            <BarChart3 className="h-4 w-4 mr-1" />
            Projeção
          </TabsTrigger>
          <TabsTrigger value="movements">
            <ArrowUpDown className="h-4 w-4 mr-1" />
            Movimentações
          </TabsTrigger>
          <TabsTrigger value="links">
            <Link2 className="h-4 w-4 mr-1" />
            Vínculos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <ItemsTab
            items={items}
            isLoading={isLoading}
            search={search}
            setSearch={setSearch}
            onNewItem={() => {
              setEditingItem(null);
              setItemDialogOpen(true);
            }}
            onEditItem={(item) => {
              setEditingItem(item);
              setItemDialogOpen(true);
            }}
            onDeleteItem={handleDeleteItem}
            deletingId={deleteItem.isPending ? deleteItem.variables : null}
          />
        </TabsContent>

        <TabsContent value="projection">
          <ProjectionTab />
        </TabsContent>

        <TabsContent value="movements">
          <MovementsTab
            movements={movements}
            onNewMovement={() => setNewMovementOpen(true)}
          />
        </TabsContent>

        <TabsContent value="links">
          <ProductLinksTab
            inventoryItems={items}
            onNewLink={() => {
              setEditingLink(null);
              setLinkDialogOpen(true);
            }}
            onEditLink={(link) => {
              setEditingLink(link);
              setLinkDialogOpen(true);
            }}
          />
        </TabsContent>
      </Tabs>

      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        initial={editingItem}
      />
      <CreateMovementDialog
        open={newMovementOpen}
        onOpenChange={setNewMovementOpen}
        items={items}
      />
      <ProductLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        inventoryItems={items}
        initial={editingLink}
      />
    </div>
  );
}
