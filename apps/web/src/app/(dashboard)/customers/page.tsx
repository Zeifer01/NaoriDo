"use client";

import { PageHeader } from "@/components/page-header";
import { CustomersTab } from "../loyalty/_components/customers-tab";

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Cadastro de clientes usados no Caixa, delivery e fidelidade"
      />
      <CustomersTab />
    </div>
  );
}
