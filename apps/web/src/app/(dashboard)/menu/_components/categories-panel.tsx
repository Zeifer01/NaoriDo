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

interface Category {
  id: string;
  name: string;
  sort_order?: number;
  is_active?: boolean;
}

function SortableCategory({ cat }: { cat: Category }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id });

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
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-sm"
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
      <div className="h-2 w-2 rounded-full bg-primary/60 shrink-0" />
      <p className="flex-1 text-sm font-medium">{cat.name}</p>
      {cat.is_active === false && (
        <span className="text-xs text-muted-foreground">inativa</span>
      )}
    </div>
  );
}

interface CategoriesPanelProps {
  categories: Category[];
}

export function CategoriesPanel({ categories }: CategoriesPanelProps) {
  const qc = useQueryClient();
  const [ordered, setOrdered] = useState<Category[]>(() =>
    [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  );
  const [saving, setSaving] = useState(false);

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
      await apiFetch("/api/menu/categories/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          categories: ordered.map((cat, idx) => ({ id: cat.id, sortOrder: idx + 1 })),
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
          Arraste para definir a ordem das categorias no cardápio. "Todos os produtos" aparece sempre no final.
        </p>
        <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Salvar ordem
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {ordered.map((cat) => (
              <SortableCategory key={cat.id} cat={cat} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
