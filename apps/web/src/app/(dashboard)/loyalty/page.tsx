"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@restai/ui/components/tabs";
import { Star, Gift, Ticket, ContactRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@restai/ui/components/button";
import { cn } from "@restai/ui";
import { LoyaltyStats } from "./_components/loyalty-stats";
import { ProgramsTab } from "./_components/programs-tab";
import { RewardsTab } from "./_components/rewards-tab";
import { CouponsTab } from "./_components/coupons-tab";

export default function LoyaltyPage() {
  const [tab, setTab] = useState("programs");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fidelidade"
        description="Programa de pontos, recompensas e cupons"
        actions={
          <Link
            href="/customers"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ContactRound className="h-4 w-4 mr-2" />
            Ir para Clientes
          </Link>
        }
      />

      <LoyaltyStats />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="programs">
            <Star className="h-4 w-4 mr-2" />
            Programas
          </TabsTrigger>
          <TabsTrigger value="rewards">
            <Gift className="h-4 w-4 mr-2" />
            Recompensas
          </TabsTrigger>
          <TabsTrigger value="coupons">
            <Ticket className="h-4 w-4 mr-2" />
            Cupons
          </TabsTrigger>
        </TabsList>

        <TabsContent value="programs">
          <ProgramsTab />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsTab />
        </TabsContent>
        <TabsContent value="coupons">
          <CouponsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
