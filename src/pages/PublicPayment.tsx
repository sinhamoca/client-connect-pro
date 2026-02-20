import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CreditCard, Calendar, User, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClientPayment {
  name: string;
  price_value: number;
  due_date: string | null;
  is_active: boolean;
  payment_type: string | null;
  plans: { name: string } | null;
}

const PublicPayment = () => {
  const { token } = useParams<{ token: string }>();
  const [client, setClient] = useState<ClientPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }

    const fetchClient = async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-payment?token=${token}`;
      const res = await fetch(url, {
        headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });

      if (!res.ok) {
        setNotFound(true);
      } else {
        const json = await res.json();
        setClient(json);
      }
      setLoading(false);
    };
    fetchClient();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <CreditCard className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">Link não encontrado</h1>
          <p className="text-muted-foreground text-sm">
            Este link de pagamento é inválido ou foi removido.
          </p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const isExpired = client.due_date
    ? (() => { const [y, m, d] = client.due_date!.split("-").map(Number); return new Date(y, m - 1, d) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()); })()
    : false;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="glass-card rounded-2xl p-8 max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <CreditCard className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-xl font-bold text-foreground">Fatura de Pagamento</h1>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-medium text-foreground">{client.name}</p>
            </div>
          </div>

          {client.plans?.name && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Plano</p>
                <p className="font-medium text-foreground">{client.plans.name}</p>
              </div>
            </div>
          )}

          {client.due_date && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p className="font-medium text-foreground">{formatDate(client.due_date)}</p>
                </div>
                {isExpired && <Badge variant="destructive" className="text-xs">Vencido</Badge>}
              </div>
            </div>
          )}

          <div className="text-center p-6 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground mb-1">Valor</p>
            <p className="text-3xl font-bold text-primary">
              R$ {Number(client.price_value).toFixed(2)}
            </p>
            {client.payment_type && (
              <p className="text-xs text-muted-foreground mt-1 uppercase">
                via {client.payment_type}
              </p>
            )}
          </div>
        </div>

        {!client.is_active && (
          <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium">
              Esta conta está inativa. Entre em contato com o administrador.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicPayment;
