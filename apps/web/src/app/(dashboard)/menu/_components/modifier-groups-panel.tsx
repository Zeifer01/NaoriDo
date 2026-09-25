"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import {
  Plus,
  Edit,
  Trash2,
  Settings2,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useModifierGroups, useDeleteModifierGroup, useBulkUpdateModifiers } from "@/hooks/use-menu";
import { useFeatures } from "@/hooks/use-features";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModifierGroupDialog } from "./modifier-group-dialog";
import { ModifierQuickEditDialog } from "./modifier-quick-edit-dialog";

const nameKey = (name: string) => name.trim().toLowerCase();

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />
  );
}

export function ModifierGroupsPainel() {
  const { data: groups, isLoading } = useModifierGroups();
  const deleteGroup = useDeleteModifierGroup();
  const bulkUpdate = useBulkUpdateModifiers();
  const { modifierQuickEdit } = useFeatures();
  const [quickEditMod, setQuickEditMod] = useState<{ name: string; price: number } | null>(null);

  const [editGroup, setEditGroup] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groupList: any[] = groups ?? [];

  // How many groups of the branch contain a modifier with a given name (quick edit applies to all of them).
  const groupCountByName = new Map<string, number>();
  for (const g of groupList) {
    const seen = new Set<string>();
    for (const m of g.modifiers ?? []) seen.add(nameKey(m.name));
    for (const k of seen) groupCountByName.set(k, (groupCountByName.get(k) ?? 0) + 1);
  }

  const handleToggleAvailability = async (mod: any) => {
    const next = mod.is_available === false;
    try {
      const res = await bulkUpdate.mutateAsync({ name: mod.name, isAvailable: next });
      toast.success(
        next
          ? `"${mod.name}" disponível novamente (${res.groups} grupo${res.groups !== 1 ? "s" : ""})`
          : `"${mod.name}" indisponível em ${res.groups} grupo${res.groups !== 1 ? "s" : ""}`,
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteGroup.mutateAsync(confirmDelete.id);
      toast.success("Grupo eliminado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
    setConfirmDelete(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {groupList.length} grupo{groupList.length !== 1 ? "s" : ""} creado
          {groupList.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo grupo
        </Button>
      </div>

      {groupList.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Settings2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            Não há grupos de modificadores
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Modificadores permitem personalizar produtos (tamanho,
            extras, salsas, etc.)
          </p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar primer grupo
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {groupList.map((group: any) => {
            const isExpanded = expandedId === group.id;
            const modifiers: any[] = group.modifiers ?? [];
            return (
              <div
                key={group.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : group.id)
                  }
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{group.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {modifiers.length} opcion
                          {modifiers.length !== 1 ? "es" : ""}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Min: {group.min_selections} / Max:{" "}
                          {group.max_selections}
                        </span>
                        {group.is_required && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0"
                          >
                            Obligatorio
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditGroup(group)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setConfirmDelete(group)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Expanded modifiers */}
                {isExpanded && modifiers.length > 0 && (
                  <div className="border-t border-border bg-muted/20 px-4 py-2">
                    <div className="space-y-1">
                      {modifiers.map((mod: any) => (
                        <div
                          key={mod.id}
                          className="flex items-center justify-between py-1.5 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                            <span
                              className={cn(
                                mod.is_available === false && "line-through text-muted-foreground",
                              )}
                            >
                              {mod.name}
                            </span>
                            {mod.is_available === false && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                Indisponível
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">
                              {mod.price > 0
                                ? `+${formatCurrency(mod.price)}`
                                : "Grátis"}
                            </span>
                            {modifierQuickEdit && (
                              <>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={mod.is_available !== false}
                                  aria-label={`Disponibilidade de ${mod.name}`}
                                  title={
                                    mod.is_available === false
                                      ? "Indisponível — clique para reativar"
                                      : "Disponível — clique para desativar"
                                  }
                                  disabled={bulkUpdate.isPending}
                                  onClick={() => handleToggleAvailability(mod)}
                                  className={cn(
                                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                                    mod.is_available === false ? "bg-muted-foreground/30" : "bg-emerald-500",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                                      mod.is_available === false ? "translate-x-0.5" : "translate-x-[18px]",
                                    )}
                                  />
                                </button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  title="Editar nome / valor"
                                  onClick={() => setQuickEditMod({ name: mod.name, price: mod.price })}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isExpanded && modifiers.length === 0 && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    <p className="text-xs text-muted-foreground text-center">
                      Sem modificadores. Edite o grupo para adicionar opções.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modifierQuickEdit && (
        <ModifierQuickEditDialog
          open={!!quickEditMod}
          onOpenChange={(v) => {
            if (!v) setQuickEditMod(null);
          }}
          modifier={quickEditMod}
          groupCount={quickEditMod ? (groupCountByName.get(nameKey(quickEditMod.name)) ?? 1) : 1}
        />
      )}

      {/* Dialogs */}
      {createOpen && (
        <ModifierGroupDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
      {editGroup && (
        <ModifierGroupDialog
          open={!!editGroup}
          onOpenChange={(v) => {
            if (!v) setEditGroup(null);
          }}
          initial={editGroup}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(v) => {
            if (!v) setConfirmDelete(null);
          }}
          title="Excluir grupo"
          description={`Excluir "${confirmDelete.name}" e todos os seus modificadores? Os produtos vinculados perderão este grupo.`}
          onConfirm={handleDelete}
          loading={deleteGroup.isPending}
        />
      )}
    </div>
  );
}
