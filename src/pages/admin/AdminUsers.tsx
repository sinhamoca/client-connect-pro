import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Plus, Pencil, Trash2, RefreshCw, UserCheck, UserX,
} from "lucide-react";
import { format } from "date-fns";

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  subscription_start: string | null;
  subscription_end: string | null;
  max_clients: number;
  max_instances: number;
  wuzapi_url: string | null;
  wuzapi_token: string | null;
}

type ModalMode = "create" | "edit" | null;

export default function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "", email: "", password: "",
    wuzapi_url: "", wuzapi_token: "",
    max_clients: 100, max_instances: 1,
    subscription_days: 30,
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter out admin users by checking user_roles
    if (data) {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = new Set((adminRoles || []).map(r => r.user_id));
      setUsers(data.filter(u => !adminIds.has(u.user_id)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => {
    setForm({
      name: "", email: "", password: "",
      wuzapi_url: "", wuzapi_token: "",
      max_clients: 100, max_instances: 1, subscription_days: 30,
    });
    setSelectedUser(null);
    setModalMode("create");
  };

  const openEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setForm({
      name: user.name, email: user.email, password: "",
      wuzapi_url: user.wuzapi_url || "",
      wuzapi_token: user.wuzapi_token || "",
      max_clients: user.max_clients,
      max_instances: user.max_instances,
      subscription_days: 30,
    });
    setModalMode("edit");
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create_user",
          email: form.email,
          password: form.password,
          name: form.name,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update profile with additional fields
      const userId = data.user.id;
      await new Promise(r => setTimeout(r, 1500)); // wait for trigger

      await supabase.from("profiles").update({
        wuzapi_url: form.wuzapi_url || null,
        wuzapi_token: form.wuzapi_token || null,
        max_clients: form.max_clients,
        max_instances: form.max_instances,
        subscription_end: new Date(Date.now() + form.subscription_days * 86400000).toISOString(),
      }).eq("user_id", userId);

      toast({ title: "Usuário criado com sucesso!" });
      setModalMode(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      // Update profile
      const { error } = await supabase.from("profiles").update({
        name: form.name,
        wuzapi_url: form.wuzapi_url || null,
        wuzapi_token: form.wuzapi_token || null,
        max_clients: form.max_clients,
        max_instances: form.max_instances,
      }).eq("user_id", selectedUser.user_id);

      if (error) throw error;

      // Update password if provided
      if (form.password) {
        const { data, error: pwError } = await supabase.functions.invoke("admin-users", {
          body: { action: "update_password", user_id: selectedUser.user_id, password: form.password },
        });
        if (pwError) throw pwError;
        if (data?.error) throw new Error(data.error);
      }

      toast({ title: "Usuário atualizado!" });
      setModalMode(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleActive = async (user: UserProfile) => {
    const { error } = await supabase.from("profiles")
      .update({ is_active: !user.is_active })
      .eq("user_id", user.user_id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: user.is_active ? "Usuário desativado" : "Usuário ativado" });
      fetchUsers();
    }
  };

  const renewUser = async (user: UserProfile) => {
    // Get default trial days
    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "default_trial_days")
      .single();
    const days = parseInt(setting?.value || "30");
    // Extend from current expiration or from now, whichever is later
    const currentEnd = user.subscription_end ? new Date(user.subscription_end) : new Date();
    const baseDate = currentEnd > new Date() ? currentEnd : new Date();
    const newEnd = new Date(baseDate.getTime() + days * 86400000).toISOString();

    const { error } = await supabase.from("profiles")
      .update({ subscription_end: newEnd, is_active: true })
      .eq("user_id", user.user_id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Renovado por ${days} dias!` });
      fetchUsers();
    }
  };

  const deleteUser = async (user: UserProfile) => {
    if (!confirm(`Tem certeza que deseja APAGAR permanentemente ${user.name || user.email}?`)) return;
    setDeleting(user.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete_user", user_id: user.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário removido permanentemente" });
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setDeleting(null);
  };

  const isExpired = (end: string | null) => {
    if (!end) return false;
    return new Date(end) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
          <p className="text-muted-foreground">{users.length} usuário(s) cadastrado(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Novo Usuário
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>WuzAPI</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name || "—"}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  {!u.is_active ? (
                    <Badge variant="destructive">Desativado</Badge>
                  ) : isExpired(u.subscription_end) ? (
                    <Badge variant="destructive">Expirado</Badge>
                  ) : (
                    <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">Ativo</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {u.subscription_end
                    ? format(new Date(u.subscription_end), "dd/MM/yyyy")
                    : "—"}
                </TableCell>
                <TableCell>
                  {u.wuzapi_url ? (
                    <Badge variant="outline" className="text-xs">Configurado</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">Não</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      title={u.is_active ? "Desativar" : "Ativar"}
                      onClick={() => toggleActive(u)}
                    >
                      {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => renewUser(u)}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Renovar
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteUser(u)}
                      disabled={deleting === u.user_id}
                    >
                      {deleting === u.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum usuário cadastrado ainda
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={!!modalMode} onOpenChange={() => setModalMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "create" ? "Novo Usuário" : "Editar Usuário"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  disabled={modalMode === "edit"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{modalMode === "edit" ? "Nova Senha (deixe vazio para manter)" : "Senha"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={modalMode === "edit" ? "••••••••" : "Mínimo 6 caracteres"}
                required={modalMode === "create"}
                minLength={6}
              />
            </div>

            {modalMode === "create" && (
              <div className="space-y-2">
                <Label>Dias de acesso</Label>
                <Input
                  type="number" min="1"
                  value={form.subscription_days}
                  onChange={e => setForm(f => ({ ...f, subscription_days: parseInt(e.target.value) || 30 }))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Clientes</Label>
                <Input
                  type="number" min="1"
                  value={form.max_clients}
                  onChange={e => setForm(f => ({ ...f, max_clients: parseInt(e.target.value) || 100 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Instâncias</Label>
                <Input
                  type="number" min="1"
                  value={form.max_instances}
                  onChange={e => setForm(f => ({ ...f, max_instances: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-medium mb-3">Credenciais WuzAPI</h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>URL da API</Label>
                  <Input
                    value={form.wuzapi_url}
                    onChange={e => setForm(f => ({ ...f, wuzapi_url: e.target.value }))}
                    placeholder="http://servidor:8080"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token de Acesso</Label>
                  <Input
                    type="password"
                    value={form.wuzapi_token}
                    onChange={e => setForm(f => ({ ...f, wuzapi_token: e.target.value }))}
                    placeholder="Token WuzAPI"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMode(null)}>Cancelar</Button>
            <Button
              onClick={modalMode === "create" ? handleCreate : handleEdit}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {modalMode === "create" ? "Criar Usuário" : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
