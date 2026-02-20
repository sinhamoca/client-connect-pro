import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2, Loader2, Link2, RefreshCw, MessageCircle, Send, History } from "lucide-react";
import { ClientModal } from "@/components/ClientModal";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

interface Client {
  id: string;
  name: string;
  whatsapp_number: string | null;
  is_active: boolean;
  due_date: string | null;
  price_value: number;
  username: string | null;
  plan_id: string | null;
  server_id: string | null;
  payment_token: string | null;
  plans: { name: string; duration_months: number } | null;
  servers: { name: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  mp_status: string | null;
  created_at: string;
}

const Clients = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [wuzapiConfigured, setWuzapiConfigured] = useState(false);

  const fetchClients = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("*, plans(name, duration_months), servers(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setClients((data as any) || []);
    setLoading(false);
  };

  // Check WhatsApp status
  useEffect(() => {
    if (!user) return;
    const checkWa = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("wuzapi_url, wuzapi_token")
        .eq("user_id", user.id)
        .single();
      if (profile?.wuzapi_url && profile?.wuzapi_token) {
        setWuzapiConfigured(true);
        try {
          const { data } = await supabase.functions.invoke("wuzapi-proxy", {
            body: { endpoint: "/session/status", method: "GET" },
          });
          const parsed = typeof data?.wuzapi_response === "string" ? JSON.parse(data.wuzapi_response) : data?.wuzapi_response;
          setWhatsappConnected(parsed?.data?.Connected === true);
        } catch { /* ignore */ }
      }
    };
    checkWa();
  }, [user]);

  useEffect(() => { fetchClients(); }, [user]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("clients").delete().eq("id", deleteId);
    toast({ title: "Cliente removido" });
    setDeleteId(null);
    fetchClients();
  };

  const handleRenew = async (client: Client) => {
    setRenewingId(client.id);
    const durationMonths = client.plans?.duration_months || 1;
    const now = new Date();
    let baseDate: Date;

    if (client.due_date) {
      const [y, m, d] = client.due_date.split("-").map(Number);
      const due = new Date(y, m - 1, d);
      baseDate = due < now ? now : due;
    } else {
      baseDate = now;
    }

    baseDate.setMonth(baseDate.getMonth() + durationMonths);
    const newDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

    const { error } = await supabase
      .from("clients")
      .update({ due_date: newDue, is_active: true })
      .eq("id", client.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cliente renovado!", description: `Novo vencimento: ${newDue.split("-").reverse().join("/")}` });
      fetchClients();
    }
    setRenewingId(null);
  };

  const handleSendInvoice = async (client: Client) => {
    if (!client.whatsapp_number || !client.payment_token) {
      toast({ title: "Erro", description: "Cliente sem WhatsApp ou token de pagamento", variant: "destructive" });
      return;
    }
    if (!whatsappConnected) {
      toast({ title: "WhatsApp desconectado", description: "Conecte o WhatsApp nas configurações antes de enviar", variant: "destructive" });
      return;
    }
    setSendingInvoice(client.id);
    try {
      const link = `${window.location.origin}/pay/${client.payment_token}`;
      const phone = client.whatsapp_number.replace(/\D/g, "");

      await supabase.functions.invoke("wuzapi-proxy", {
        body: {
          endpoint: "/chat/send/text",
          method: "POST",
          body: {
            Phone: phone,
            Body: link,
          },
        },
      });
      toast({ title: "Fatura enviada!", description: `Link enviado para ${client.whatsapp_number}` });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
    setSendingInvoice(null);
  };

  const openHistory = async (client: Client) => {
    setHistoryClient(client);
    setLoadingPayments(true);
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });
    setPayments((data as Payment[]) || []);
    setLoadingPayments(false);
  };

  const getStatus = (client: Client) => {
    if (!client.is_active) return { label: "Inativo", variant: "secondary" as const };
    if (!client.due_date) return { label: "Ativo", variant: "default" as const };
    const [y, m, d] = client.due_date.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const now = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    if (due < now) return { label: "Vencido", variant: "destructive" as const };
    const in7 = new Date(now.getTime() + 7 * 86400000);
    if (due <= in7) return { label: "Vencendo", variant: "outline" as const };
    return { label: "Ativo", variant: "default" as const };
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.whatsapp_number?.includes(search) ||
    c.username?.toLowerCase().includes(search.toLowerCase())
  );

  const statusLabel = (s: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      paid: { label: "Pago", variant: "default" },
      approved: { label: "Pago", variant: "default" },
      pending: { label: "Pendente", variant: "outline" },
      rejected: { label: "Rejeitado", variant: "destructive" },
      cancelled: { label: "Cancelado", variant: "secondary" },
    };
    return map[s] || { label: s, variant: "secondary" as const };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <Button onClick={() => { setEditingClient(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, WhatsApp ou username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Nome</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Servidor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => {
                const status = getStatus(client);
                return (
                  <TableRow key={client.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="text-muted-foreground">{client.whatsapp_number || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{client.plans?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{client.servers?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.due_date ? (() => { const [y,m,d] = client.due_date!.split("-"); return `${d}/${m}/${y}`; })() : "—"}
                    </TableCell>
                    <TableCell>R$ {Number(client.price_value).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              title="Renovar manualmente"
                              onClick={() => handleRenew(client)}
                              disabled={renewingId === client.id}
                            >
                              {renewingId === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Renovar</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              title="Abrir WhatsApp"
                              onClick={() => {
                                if (client.whatsapp_number) {
                                  window.open(`https://wa.me/${client.whatsapp_number.replace(/\D/g, "")}`, "_blank");
                                } else {
                                  toast({ title: "Sem número", description: "Cliente não tem WhatsApp cadastrado", variant: "destructive" });
                                }
                              }}
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Abrir WhatsApp</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              title="Enviar fatura via WhatsApp"
                              onClick={() => handleSendInvoice(client)}
                              disabled={sendingInvoice === client.id || !whatsappConnected}
                            >
                              {sendingInvoice === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{whatsappConnected ? "Enviar fatura via WhatsApp" : "WhatsApp desconectado"}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" title="Histórico de pagamentos" onClick={() => openHistory(client)}>
                              <History className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Histórico</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              title="Copiar link de pagamento"
                              onClick={() => {
                                const link = `${window.location.origin}/pay/${client.payment_token}`;
                                navigator.clipboard.writeText(link);
                                toast({ title: "Link copiado!", description: link });
                              }}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar link</TooltipContent>
                        </Tooltip>

                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { setEditingClient(client); setModalOpen(true); }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => setDeleteId(client.id)}
                          className="hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ClientModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingClient(null); }}
        client={editingClient}
        onSaved={fetchClients}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment History Dialog */}
      <Dialog open={!!historyClient} onOpenChange={() => setHistoryClient(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Pagamentos — {historyClient?.name}</DialogTitle>
          </DialogHeader>
          {loadingPayments ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum pagamento registrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => {
                  const s = statusLabel(p.mp_status || p.status);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm">R$ {Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-sm uppercase text-muted-foreground">{p.payment_method || "—"}</TableCell>
                      <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Clients;
