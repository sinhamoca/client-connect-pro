import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Users, UserCheck, UserX, AlertTriangle, TrendingUp, TrendingDown,
  Clock, CalendarClock, CalendarX2, DollarSign, PiggyBank,
} from "lucide-react";

interface Stats {
  total: number;
  active: number;
  inactive: number;
  expiring: number;
  expired: number;
  expired30: number;
  expired60: number;
  expired90: number;
}

interface FinancialSummary {
  monthlyRevenue: number;
  monthlyCost: number;
  monthlyProfit: number;
  yearlyRevenue: number;
  yearlyCost: number;
  yearlyProfit: number;
}

interface Profile {
  email: string;
  subscription_end: string | null;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, inactive: 0, expiring: 0, expired: 0, expired30: 0, expired60: 0, expired90: 0 });
  const [financial, setFinancial] = useState<FinancialSummary>({ monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0, yearlyRevenue: 0, yearlyCost: 0, yearlyProfit: 0 });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: clients }, { data: prof }] = await Promise.all([
        supabase.from("clients")
          .select("id, is_active, due_date, price_value, server_id, plan_id, plans(num_screens), servers(name, cost_per_screen, multiply_by_screens)")
          .eq("user_id", user.id),
        supabase.from("profiles").select("email, subscription_end").eq("user_id", user.id).single(),
      ]);

      if (prof) setProfile(prof);

      if (clients) {
        const now = new Date();
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const in7Days = new Date(nowDate.getTime() + 7 * 86400000);
        const ago30 = new Date(nowDate.getTime() - 30 * 86400000);
        const ago60 = new Date(nowDate.getTime() - 60 * 86400000);
        const ago90 = new Date(nowDate.getTime() - 90 * 86400000);

        const withDue = clients.map(c => ({
          ...c,
          dueDate: c.due_date ? new Date(c.due_date) : null,
        }));

        setStats({
          total: clients.length,
          active: clients.filter(c => c.is_active).length,
          inactive: clients.filter(c => !c.is_active).length,
          expired: withDue.filter(c => c.dueDate && c.dueDate < nowDate).length,
          expiring: withDue.filter(c => c.dueDate && c.dueDate >= nowDate && c.dueDate <= in7Days).length,
          expired30: withDue.filter(c => c.dueDate && c.dueDate < nowDate && c.dueDate <= ago30).length,
          expired60: withDue.filter(c => c.dueDate && c.dueDate < nowDate && c.dueDate <= ago60).length,
          expired90: withDue.filter(c => c.dueDate && c.dueDate < nowDate && c.dueDate <= ago90).length,
        });

        // Financial calc
        const activeClients = (clients as any[]).filter(c => c.is_active);
        const monthlyRevenue = activeClients.reduce((sum, c) => sum + Number(c.price_value || 0), 0);
        const monthlyCost = activeClients.reduce((sum, c) => {
          if (!c.servers) return sum;
          const screens = c.plans?.num_screens || 1;
          const costPerScreen = Number(c.servers.cost_per_screen || 0);
          return sum + (c.servers.multiply_by_screens ? costPerScreen * screens : costPerScreen);
        }, 0);

        setFinancial({
          monthlyRevenue,
          monthlyCost,
          monthlyProfit: monthlyRevenue - monthlyCost,
          yearlyRevenue: monthlyRevenue * 12,
          yearlyCost: monthlyCost * 12,
          yearlyProfit: (monthlyRevenue - monthlyCost) * 12,
        });
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const statCards = [
    { label: "Total Clientes", value: stats.total, icon: Users, color: "text-primary" },
    { label: "Ativos", value: stats.active, icon: UserCheck, color: "text-success" },
    { label: "Inativos", value: stats.inactive, icon: UserX, color: "text-muted-foreground" },
    { label: "Vencendo (7d)", value: stats.expiring, icon: AlertTriangle, color: "text-warning" },
    { label: "Vencidos", value: stats.expired, icon: TrendingUp, color: "text-destructive" },
  ];

  const expiredCards = [
    { label: "Vencidos +30d", value: stats.expired30, icon: Clock, color: "text-warning" },
    { label: "Vencidos +60d", value: stats.expired60, icon: CalendarClock, color: "text-destructive" },
    { label: "Vencidos +90d", value: stats.expired90, icon: CalendarX2, color: "text-destructive" },
  ];

  const val = (n: number) => loading ? "—" : `R$ ${n.toFixed(2)}`;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">{profile?.email || "Carregando..."}</p>
        {profile?.subscription_end && (
          <p className="text-sm text-muted-foreground">
            Plano expira em{" "}
            <span className="font-medium text-foreground">
              {new Date(profile.subscription_end).toLocaleDateString("pt-BR")}
            </span>
          </p>
        )}
      </div>

      {/* Client Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold">{loading ? "—" : card.value}</p>
          </div>
        ))}
      </div>

      {/* Expired Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {expiredCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold">{loading ? "—" : card.value}</p>
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Resumo Mensal
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Receita</span>
              <span className="font-semibold text-success">{val(financial.monthlyRevenue)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">{val(financial.monthlyCost)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Líquido</span>
              <span className={`font-bold text-lg ${financial.monthlyProfit >= 0 ? "text-success" : "text-destructive"}`}>
                {val(financial.monthlyProfit)}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            Projeção Anual
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Receita</span>
              <span className="font-semibold text-success">{val(financial.yearlyRevenue)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">{val(financial.yearlyCost)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Líquido</span>
              <span className={`font-bold text-lg ${financial.yearlyProfit >= 0 ? "text-success" : "text-destructive"}`}>
                {val(financial.yearlyProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Bem-vindo ao GestãoPro</h2>
        <p className="text-muted-foreground">
          Comece adicionando seus <strong>servidores</strong> e <strong>planos</strong>, 
          depois cadastre seus <strong>clientes</strong>. Configure templates e lembretes 
          para automatizar suas cobranças via WhatsApp.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
