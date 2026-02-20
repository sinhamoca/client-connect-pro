import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const PROVIDERS_WITH_PACKAGE = ["sigma", "painelfoda"];
const PROVIDERS_WITH_RUSH = ["rush"];

const Plans = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", panel_credential_id: "", package_id: "",
    duration_months: "1", num_screens: "1", rush_type: "",
  });

  // Sigma packages
  const [sigmaPackages, setSigmaPackages] = useState<any[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [showPackages, setShowPackages] = useState(false);

  const fetchPlans = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("plans")
      .select("*, panel_credentials:panel_credential_id(id, provider, label)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPlans(data || []);
    setLoading(false);
  };

  const fetchPanels = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("panel_credentials")
      .select("id, provider, label")
      .eq("user_id", user.id)
      .eq("is_active", true);
    setPanels(data || []);
  };

  useEffect(() => { fetchPlans(); fetchPanels(); }, [user]);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        panel_credential_id: editing.panel_credential_id || "",
        package_id: editing.package_id || "",
        duration_months: String(editing.duration_months),
        num_screens: String(editing.num_screens),
        rush_type: editing.rush_type || "",
      });
    } else {
      setForm({ name: "", panel_credential_id: "", package_id: "", duration_months: "1", num_screens: "1", rush_type: "" });
    }
    setSigmaPackages([]);
    setShowPackages(false);
  }, [editing, modalOpen]);

  const selectedPanel = panels.find(p => p.id === form.panel_credential_id);
  const provider = selectedPanel?.provider || "";
  const needsPackageId = PROVIDERS_WITH_PACKAGE.includes(provider);
  const needsRushType = PROVIDERS_WITH_RUSH.includes(provider);

  const handleFetchPackages = async () => {
    if (!form.panel_credential_id || provider !== "sigma") return;
    setLoadingPackages(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sigma-packages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ credential_id: form.panel_credential_id }),
        }
      );
      const result = await res.json();
      if (result.success && result.packages) {
        setSigmaPackages(result.packages);
        setShowPackages(true);
      } else {
        toast({ title: "Erro", description: result.error || "Falha ao buscar pacotes", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    }
    setLoadingPackages(false);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      name: form.name.trim(),
      panel_credential_id: form.panel_credential_id || null,
      package_id: needsPackageId ? (form.package_id || null) : null,
      duration_months: parseInt(form.duration_months) || 1,
      num_screens: parseInt(form.num_screens) || 1,
      rush_type: needsRushType ? (form.rush_type || "IPTV") : null,
    };
    const { error } = editing
      ? await supabase.from("plans").update(payload).eq("id", editing.id)
      : await supabase.from("plans").insert(payload);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: editing ? "Plano atualizado" : "Plano criado" }); setModalOpen(false); setEditing(null); fetchPlans(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("plans").delete().eq("id", deleteId);
    toast({ title: "Plano removido" }); setDeleteId(null); fetchPlans();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-muted-foreground">{plans.length} planos cadastrados</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Plano
        </Button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Nome</TableHead>
              <TableHead>Painel</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Telas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : plans.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Nenhum plano cadastrado</TableCell></TableRow>
            ) : plans.map(plan => (
              <TableRow key={plan.id} className="border-border/30">
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell>
                  {plan.panel_credentials ? (
                    <Badge variant="outline">{plan.panel_credentials.label || plan.panel_credentials.provider}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{plan.duration_months} {plan.duration_months === 1 ? "mês" : "meses"}</TableCell>
                <TableCell>{plan.num_screens}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(plan); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(plan.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Plano" : "Novo Plano"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Mensal 1 Tela Sigma" />
            </div>

            <div className="space-y-2">
              <Label>Painel IPTV</Label>
              <Select value={form.panel_credential_id} onValueChange={v => setForm(f => ({ ...f, panel_credential_id: v, package_id: "", rush_type: "" }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar painel (opcional)" /></SelectTrigger>
                <SelectContent>
                  {panels.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label || p.provider} ({p.provider})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsPackageId && (
              <div className="space-y-2">
                <Label>Package ID {provider === "sigma" ? "(sigma_plan_code)" : "(painelfoda_package_id)"}</Label>
                <div className="flex gap-2">
                  <Input value={form.package_id} onChange={e => setForm(f => ({ ...f, package_id: e.target.value }))} placeholder="Ex: XYgD9JWr6V" />
                  {provider === "sigma" && (
                    <Button type="button" variant="outline" size="icon" onClick={handleFetchPackages} disabled={loadingPackages}>
                      {loadingPackages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {showPackages && sigmaPackages.length > 0 && (
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">Pacotes disponíveis — clique para selecionar:</p>
                {sigmaPackages.map((pkg: any) => (
                  <button
                    key={pkg.id}
                    className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-accent transition-colors ${form.package_id === pkg.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                    onClick={() => setForm(f => ({ ...f, package_id: pkg.id }))}
                  >
                    <span className="font-mono text-xs">{pkg.id}</span> — {pkg.name} ({pkg.connections} tela{pkg.connections > 1 ? "s" : ""})
                  </button>
                ))}
              </div>
            )}

            {needsRushType && (
              <div className="space-y-2">
                <Label>Tipo Rush</Label>
                <Select value={form.rush_type || "IPTV"} onValueChange={v => setForm(f => ({ ...f, rush_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IPTV">IPTV</SelectItem>
                    <SelectItem value="P2P">P2P</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duração (meses)</Label>
                <Input type="number" min="1" value={form.duration_months} onChange={e => setForm(f => ({ ...f, duration_months: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Nº Telas</Label>
                <Input type="number" min="1" value={form.num_screens} onChange={e => setForm(f => ({ ...f, num_screens: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salvar" : "Criar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover plano?</AlertDialogTitle>
            <AlertDialogDescription>Clientes associados ficarão sem plano.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Plans;
