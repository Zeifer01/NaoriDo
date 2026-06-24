"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { RefreshCw, Building2, MapPin, Store, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { OrgTab } from "./_components/org-tab";
import { BranchTab } from "./_components/branch-tab";
import { FiliaisTab } from "./_components/sedes-tab";
import { WhatsAppTab } from "./_components/whatsapp-tab";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"org" | "branch" | "sedes" | "whatsapp">("org");

  const { error: orgError, refetch: refetchOrg } = useOrgSettings();
  const { error: branchError, refetch: refetchBranch } = useBranchSettings();

  const error = orgError || branchError;
  if (error) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader title="Configurações" />
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">Erro ao carregar: {(error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => { refetchOrg(); refetchBranch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Configurações"
        description="Administre as configurações da sua organização e filiais"
      />

      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === "org" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("org")}
        >
          <Building2 className="h-4 w-4 mr-2" />
          Organização
        </Button>
        <Button
          variant={activeTab === "branch" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("branch")}
        >
          <MapPin className="h-4 w-4 mr-2" />
          Sede
        </Button>
        <Button
          variant={activeTab === "sedes" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("sedes")}
        >
          <Store className="h-4 w-4 mr-2" />
          Filiais
        </Button>
        <Button
          variant={activeTab === "whatsapp" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("whatsapp")}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          WhatsApp
        </Button>
      </div>

      {activeTab === "org" && <OrgTab />}
      {activeTab === "branch" && <BranchTab />}
      {activeTab === "sedes" && <FiliaisTab />}
      {activeTab === "whatsapp" && <WhatsAppTab />}
    </div>
  );
}
