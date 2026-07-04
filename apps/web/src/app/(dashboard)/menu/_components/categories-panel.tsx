"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { toast } from "sonner";

const ALL_ID = "__all__";

interface Category {
  id: string;
  name: string;
  sort_order?: number;
  is_active?: boolean;
}

interface SortableItem {
  id: string;
  name: string;
  isAll?: boolean;
  is_active?: boolean;
}

function SortableCategory({ item }: { item: SortableItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border px-3 py-3 shadow-sm ${
        item.isAll
          ? "border-dashed border-muted-foreground/30 bg-muted/40"
          : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className={`h-2 w-2 rounded-full shrink-0 ${item.isAll ? "bg-muted-foreground/40" : "bg-primary/60"}`} />
      <p className={`flex-1 text-sm font-medium ${item.isAll ? "text-muted-foreground italic" : ""}`}>
        {item.name}
      </p>
      {item.is_active === false && (
        <span className="text-xs text-muted-foreground">inativa</span>
      )}
    </div>
  );
}

interface CategoriesPanelProps {
  categories: Category[];
  allProductsSortOrder?: number | null;
}

export function CategoriesPanel({ categories, allProductsSortOrder }: CategoriesPanelProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const buildOrdered = (): SortableItem[] => {
    const sorted: SortableItem[] = [...categories]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((c) => ({ id: c.id, name: c.name, is_active: c.is_active }));

    const allItem: SortableItem = { id: ALL_ID, name: "Todos os produtos", isAll: true };
    const insertAt = allProductsSortOrder != null
      ? Math.min(allProductsSortOrder, sorted.length)
      : sorted.length;
    sorted.splice(insertAt, 0, allItem);
    return sorted;
  };

  const [ordered, setOrdered] = useState<SortableItem[]>(buildOrdered);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrdered((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const allIndex = ordered.findIndex((c) => c.id === ALL_ID);
      const realCategories = ordered
        .filter((c) => c.id !== ALL_ID)
        .map((cat, idx) => ({ id: cat.id, sortOrder: idx + (idx >= allIndex ? 1 : 0) }));

      await apiFetch("/api/menu/categories/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          categories: realCategories.map((c, idx) => ({ id: c.id, sortOrder: idx + 1 })),
          allProductsSortOrder: allIndex,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Ordem das categorias salva");
    } catch {
      toast.error("Erro ao salvar ordem das categorias");
    } finally {
      setSaving(false);
    }
  };

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhuma categoria cadastrada ainda.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Arraste para definir a ordem das abas no cardápio, incluindo "Todos os produtos".
        </p>
        <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Salvar ordem
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {ordered.map((item) => (
              <SortableCategory key={item.id} item={item} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
