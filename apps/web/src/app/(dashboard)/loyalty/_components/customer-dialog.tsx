"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Textarea } from "@restai/ui/components/textarea";
import { Label } from "@restai/ui/components/label";
import { DatePicker } from "@restai/ui/components/date-picker";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useCreateCustomer, useUpdateCustomer } from "@/hooks/use-loyalty";
import { toast } from "sonner";

export interface EditableCustomer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  address?: string | null;
  notes?: string | null;
}

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  birthDate: "",
  address: "",
  notes: "",
};

function formFromCustomer(customer: EditableCustomer) {
  return {
    name: customer.name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    birthDate: customer.birth_date || "",
    address: customer.address || "",
    notes: customer.notes || "",
  };
}

export function CreateCustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this customer instead of creating a new one. */
  customer?: EditableCustomer | null;
}) {
  const isEditing = !!customer;
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(customer ? formFromCustomer(customer) : EMPTY_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      birthDate: form.birthDate || undefined,
      address: form.address || undefined,
      notes: form.notes || undefined,
    };

    const onSuccess = () => {
      onOpenChange(false);
      toast.success(isEditing ? "Cliente atualizado com sucesso" : "Cliente cadastrado com sucesso");
    };
    const onError = (err: unknown) => toast.error(`Error: ${(err as Error).message}`);

    if (isEditing && customer) {
      updateCustomer.mutate({ id: customer.id, ...payload }, { onSuccess, onError });
    } else {
      createCustomer.mutate(payload, { onSuccess, onError });
    }
  }

  const isPending = createCustomer.isPending || updateCustomer.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Cliente" : "Cadastrar Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-name">Nome *</Label>
            <Input
              id="cust-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-phone">Telefone</Label>
            <Input
              id="cust-phone"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-address">Endereço</Label>
            <Textarea
              id="cust-address"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              className="min-h-[64px] resize-none"
              placeholder="Rua, número, complemento…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-notes">Observação</Label>
            <Textarea
              id="cust-notes"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="min-h-[64px] resize-none"
              placeholder="Preferências, portão, etc."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-birth">Data de nascimento</Label>
            <DatePicker
              id="cust-birth"
              value={form.birthDate}
              onChange={(d) => setForm((p) => ({ ...p, birthDate: d ?? "" }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !form.name}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
