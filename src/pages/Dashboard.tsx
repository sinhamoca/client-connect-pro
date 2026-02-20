import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, UserCheck, UserX, AlertTriangle, TrendingUp } from "lucide-react";

interface Stats {
  total: number;
  active: number;
  inactive: number;
  expiring: number;
  expired: number;
}

interface Profile {
  email: string;
  subscription_end: string | null;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, inactive: 0, expiring: 0, expired: 0 });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: clients }, { data: prof }] = await Promise.all([
        supabase.from("clients").select("id, is_active, due_date").eq("user_id", user.id),
        supabase.from("profiles").select("email, subscription_end").eq("user_id", user.id).single(),
      ]);

      if (prof) setProfile(prof);

      if (clients) {
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        setStats({
          total: clients.length,
          active: clients.filter(c => c.is_active).length,
          inactive: clients.filter(c => !c.is_active).length,
          expired: clients.filter(c => c.due_date && new Date(c.due_date) < now).length,
          expiring: clients.filter(c => c.due_date && new Date(c.due_date) >= now && new Date(c.due_date) <= in7Days).length,
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
