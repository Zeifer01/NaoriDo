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
import { formatCurrency } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  imageUrl?: string | null;
  sort_order?: number;
  category_id?: string;
  categoryId?: string;
}

function SortableRow({
  item,
  categoryName,
}: {
  item: Item;
  categoryName?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const imgUrl = item.imageUrl || item.image_url;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
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
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={item.name}
          className="h-9 w-9 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="h-9 w-9 rounded-md bg-muted shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        {categoryName && (
          <p className="text-xs text-muted-foreground truncate">{categoryName}</p>
        )}
      </div>
      <p className="text-sm font-semibold shrink-0">{formatCurrency(item.price)}</p>
    </div>
  );
}

interface ReorderPanelProps {
  items: Item[];
  categories: { id: string; name: string }[];
  onSave: (ordered: { id: string; sortOrder: number }[]) => Promise<void>;
  onCancel: () => void;
}

export function ReorderPanel({ items, categories, onSave, onCancel }: ReorderPanelProps) {
  const [orderedItems, setOrderedItems] = useState<Item[]>(() =>
    [...items].sort((a, b) => {
      const sa = a.sort_order ?? 0;
      const sb = b.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, "pt-BR");
    }),
  );
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        orderedItems.map((item, idx) => ({ id: item.id, sortOrder: idx + 1 })),
      );
    } finally {
      setSaving(false);
    }
  };

  const getCategoryName = (item: Item) => {
    const catId = item.categoryId || item.category_id;
    return categories.find((c) => c.id === catId)?.name;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Arraste os itens para definir a ordem de exibição no cardápio.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Salvar ordem
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {orderedItems.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                categoryName={getCategoryName(item)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
