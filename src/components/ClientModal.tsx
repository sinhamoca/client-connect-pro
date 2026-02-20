import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Plan { id: string; name: string; panel_credential_id?: string | null; }
interface PanelCred { id: string; provider: string; }
interface Server { id: string; name: string; }

interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  client: any | null;
  onSaved: () => void;
}

export function ClientModal({ open, onClose, client, onSaved }: ClientModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [panelCreds, setPanelCreds] = useState<PanelCred[]>([]);

  const [form, setForm] = useState({
    name: "", whatsapp_number: "", plan_id: "", server_id: "",
    price_value: "", due_date: "", notes: "", username: "", suffix: "",
    is_active: true, payment_type: "pix",
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("plans").select("id, name, panel_credential_id").eq("user_id", user.id).then(({ data }) => setPlans(data || []));
    supabase.from("servers").select("id, name").eq("user_id", user.id).then(({ data }) => setServers(data || []));
    supabase.from("panel_credentials").select("id, provider").eq("user_id", user.id).then(({ data }) => setPanelCreds(data || []));
  }, [user]);

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name || "", whatsapp_number: client.whatsapp_number || "",
        plan_id: client.plan_id || "", server_id: client.server_id || "",
        price_value: String(client.price_value || ""), due_date: client.due_date || "",
        notes: client.notes || "", username: client.username || "", suffix: client.suffix || "",
        is_active: client.is_active ?? true, payment_type: client.payment_type || "pix",
      });
    } else {
      setForm({
        name: "", whatsapp_number: "", plan_id: "", server_id: "",
        price_value: "", due_date: "", notes: "", username: "", suffix: "",
        is_active: true, payment_type: "pix",
      });
    }
  }, [client, open]);

  // Find provider from selected plan
  const selectedPlan = plans.find(p => p.id === form.plan_id);
  const panelCred = panelCreds.find(pc => pc.id === selectedPlan?.panel_credential_id);
  const providerRequiresClientId = panelCred?.provider === "koffice" || panelCred?.provider === "club";

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    if (providerRequiresClientId && !form.username.trim()) {
      toast({ title: "ID do cliente no painel é obrigatório", description: `O provider ${panelCred?.provider} exige o campo ID/Username.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      whatsapp_number: form.whatsapp_number || null,
      plan_id: form.plan_id || null,
      server_id: form.server_id || null,
      price_value: parseFloat(form.price_value) || 0,
      due_date: form.due_date || null,
      notes: form.notes || null,
      username: form.username || null,
      suffix: form.suffix || null,
      is_active: form.is_active,
      payment_type: form.payment_type,
    };

    const { error } = client
      ? await supabase.from("clients").update(payload).eq("id", client.id)
      : await supabase.from("clients").insert(payload);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: client ? "Cliente atualizado" : "Cliente criado" });
      onSaved();
      onClose();
    }
    setSaving(false);
  };

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="col-span-2 space-y-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome do cliente" />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp_number} onChange={e => set("whatsapp_number", e.target.value)} placeholder="5511999999999" />
          </div>
          <div className="space-y-2">
            <Label>Plano</Label>
            <Select value={form.plan_id} onValueChange={v => set("plan_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar plano" /></SelectTrigger>
              <SelectContent>
                {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Servidor</Label>
            <Select value={form.server_id} onValueChange={v => set("server_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar servidor" /></SelectTrigger>
              <SelectContent>
                {servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={form.price_value} onChange={e => set("price_value", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Vencimento</Label>
            <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tipo Pagamento</Label>
            <Select value={form.payment_type} onValueChange={v => set("payment_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="link">Link</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={form.is_active} onCheckedChange={v => set("is_active", v)} />
            <Label>Ativo</Label>
          </div>

          {/* Username / Client ID */}
          <div className="space-y-2">
            <Label>{providerRequiresClientId ? "ID do Cliente no Painel *" : "Username / ID no Painel"}</Label>
            <Input value={form.username} onChange={e => set("username", e.target.value)} placeholder={providerRequiresClientId ? "Obrigatório para este provider" : "Opcional"} />
            {providerRequiresClientId && (
              <p className="text-xs text-destructive">Obrigatório para {panelCred?.provider}. Para múltiplas telas, separe IDs por vírgula.</p>
            )}
          </div>

          {/* Suffix */}
          <div className="space-y-2">
            <Label>Sufixo Multi-Tela</Label>
            <Input value={form.suffix} onChange={e => set("suffix", e.target.value)} placeholder="Ex: tela 1,tela 2,tela 3" />
            <p className="text-xs text-muted-foreground">Separe por vírgula. Deixe vazio para 1 tela.</p>
          </div>

          <div className="col-span-2 space-y-2">
            <Label>Observações</Label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Notas..." />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {client ? "Salvar" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
