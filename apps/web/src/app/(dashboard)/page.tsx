"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@restai/ui/components/card";
import {
  ClipboardList,
  DollarSign,
  TrendingUp,
  Receipt,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { formatCurrency } from "@/lib/utils";
import { useDashboardStats, useRecentOrders } from "@/hooks/use-dashboard";
import { useTopItems } from "@/hooks/use-reports";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  preparing: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  served: "bg-gray-100 text-gray-800",
  confirmed: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-800",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  preparing: "Preparando",
  ready: "Pronto",
  served: "Servido",
  confirmed: "Confirmado",
  completed: "Concluído",
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

export default function DashboardPage() {
  const today = getTodayDate();
  const { data: dashboardStats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useDashboardStats();
  const { data: recentOrders, isLoading: ordersLoading, error: ordersError, refetch: refetchOrders } = useRecentOrders();
  const { data: topItemsData, isLoading: topItemsLoading } = useTopItems(today, today, 5);

  const stats = dashboardStats
    ? [
        {
          title: "Pedidos Hoje",
          value: dashboardStats.totalOrders ?? 0,
          icon: ClipboardList,
          description: "",
        },
        {
          title: "Receita Hoje",
          value: dashboardStats.totalRevenue ?? 0,
          icon: DollarSign,
          description: "",
          isCurrency: true,
        },
        {
          title: "Pedidos Ativos",
          value: dashboardStats.activeOrders ?? 0,
          icon: TrendingUp,
          description: "Em aberto agora",
        },
        {
          title: "Ticket Médio",
          value: dashboardStats.averageOrderValue ?? 0,
          icon: Receipt,
          description: "Por pedido hoje",
          isCurrency: true,
        },
      ]
    : [];

  const orders: any[] = recentOrders ?? [];
  const topItems: any[] = topItemsData ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Painel</h1>
        <p className="text-muted-foreground">
          Visão geral do dia
        </p>
      </div>

      {/* Stats Cards */}
      {statsError ? (
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">Erro ao carregar estatísticas: {(statsError as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => refetchStats()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-20 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </CardContent>
                </Card>
              ))
            : stats.map((stat) => (
                <Card key={stat.title}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stat.isCurrency
                        ? formatCurrency(stat.value as number)
                        : stat.value}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stat.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Pedidos Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersError ? (
              <div className="text-center py-4">
                <p className="text-sm text-destructive mb-2">Erro ao carregar pedidos</p>
                <Button variant="outline" size="sm" onClick={() => refetchOrders()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
              </div>
            ) : ordersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div>
                        <Skeleton className="h-4 w-16 mb-1" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum pedido recente
              </p>
            ) : (
              <div className="space-y-3">
                {orders.map((order: any) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-sm">
                          #{order.orderNumber || order.order_number || order.id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.customer_name || (order.table_number ? `Mesa ${order.table_number}` : "—")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[order.status] || "bg-gray-100 text-gray-800"}`}
                      >
                        {statusLabels[order.status] || order.status}
                      </span>
                      <span className="text-sm font-medium">
                        {formatCurrency(order.total ?? 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Items Today */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <CardTitle>Mais Vendidos Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {topItemsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : topItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma venda registrada hoje
              </p>
            ) : (
              <div className="space-y-3">
                {topItems.map((item: any, index: number) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        index === 0 ? "bg-amber-100 text-amber-700" :
                        index === 1 ? "bg-gray-100 text-gray-600" :
                        index === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </span>
                      <p className="text-sm font-medium truncate max-w-[180px]">{item.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(item.totalRevenue)}</p>
                      <p className="text-xs text-muted-foreground">{item.totalQuantity} un.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
