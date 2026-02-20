import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Loader2 } from "lucide-react";

interface FinancialData {
  totalRevenue: number;
  totalCost: number;
  profit: number;
  activeClients: number;
  avgTicket: number;
  clientsByServer: { name: string; count: number; cost: number }[];
}

const Financial = () => {
  const { user } = useAuth();
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchFinancial = async () => {
      const [clientsRes, serversRes] = await Promise.all([
        supabase.from("clients").select("id, is_active, price_value, server_id, plan_id, plans(num_screens), servers(name, cost_per_screen, multiply_by_screens)").eq("user_id", user.id),
        supabase.from("servers").select("*").eq("user_id", user.id),
      ]);

      const clients = (clientsRes.data as any[]) || [];
      const activeClients = clients.filter(c => c.is_active);

      const totalRevenue = activeClients.reduce((sum, c) => sum + Number(c.price_value || 0), 0);

      const totalCost = activeClients.reduce((sum, c) => {
        if (!c.servers) return sum;
        const screens = c.plans?.num_screens || 1;
        const costPerScreen = Number(c.servers.cost_per_screen || 0);
        const cost = c.servers.multiply_by_screens ? costPerScreen * screens : costPerScreen;
        return sum + cost;
      }, 0);

      const serverMap = new Map<string, { name: string; count: number; cost: number }>();
      activeClients.forEach(c => {
        const serverName = c.servers?.name || "Sem servidor";
        const existing = serverMap.get(serverName) || { name: serverName, count: 0, cost: 0 };
        existing.count++;
        if (c.servers) {
          const screens = c.plans?.num_screens || 1;
          const costPerScreen = Number(c.servers.cost_per_screen || 0);
          existing.cost += c.servers.multiply_by_screens ? costPerScreen * screens : costPerScreen;
        }
        serverMap.set(serverName, existing);
      });

      setData({
        totalRevenue,
        totalCost,
        profit: totalRevenue - totalCost,
        activeClients: activeClients.length,
        avgTicket: activeClients.length > 0 ? totalRevenue / activeClients.length : 0,
        clientsByServer: Array.from(serverMap.values()).sort((a, b) => b.count - a.count),
      });
      setLoading(false);
    };
    fetchFinancial();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const statCards = [
    { label: "Receita Mensal", value: `R$ ${data.totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-success" },
    { label: "Custo Mensal", value: `R$ ${data.totalCost.toFixed(2)}`, icon: TrendingDown, color: "text-destructive" },
    { label: "Lucro Mensal", value: `R$ ${data.profit.toFixed(2)}`, icon: TrendingUp, color: data.profit >= 0 ? "text-success" : "text-destructive" },
    { label: "Ticket Médio", value: `R$ ${data.avgTicket.toFixed(2)}`, icon: PiggyBank, color: "text-primary" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Financeiro</h1>
        <p className="text-muted-foreground">Visão geral financeira baseada em {data.activeClients} clientes ativos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Clientes por Servidor</h2>
        {data.clientsByServer.length === 0 ? (
          <p className="text-muted-foreground">Nenhum cliente ativo com servidor associado.</p>
        ) : (
          <div className="space-y-3">
            {data.clientsByServer.map(server => (
              <div key={server.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                <div>
                  <p className="font-medium">{server.name}</p>
                  <p className="text-sm text-muted-foreground">{server.count} clientes</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-destructive">Custo: R$ {server.cost.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Margem de Lucro</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-success to-primary transition-all"
              style={{ width: `${data.totalRevenue > 0 ? Math.min((data.profit / data.totalRevenue) * 100, 100) : 0}%` }}
            />
          </div>
          <span className="font-bold text-lg">
            {data.totalRevenue > 0 ? ((data.profit / data.totalRevenue) * 100).toFixed(1) : 0}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default Financial;
