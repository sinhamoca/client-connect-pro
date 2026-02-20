import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Edit, Trash2, Loader2, Link2 } from "lucide-react";
import { ClientModal } from "@/components/ClientModal";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  plans: { name: string } | null;
  servers: { name: string } | null;
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

  const fetchClients = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("*, plans(name), servers(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setClients((data as any) || []);
    setClients((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, [user]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("clients").delete().eq("id", deleteId);
    toast({ title: "Cliente removido" });
    setDeleteId(null);
    fetchClients();
  };

  const getStatus = (client: Client) => {
    if (!client.is_active) return { label: "Inativo", variant: "secondary" as const };
    if (!client.due_date) return { label: "Ativo", variant: "default" as const };
    const due = new Date(client.due_date);
    const now = new Date();
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
    </div>
  );
};

export default Clients;
