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

interface Plan { id: string; name: string; }
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

  const [form, setForm] = useState({
    name: "", whatsapp_number: "", plan_id: "", server_id: "",
    price_value: "", due_date: "", username: "", suffix: "",
    password: "", mac_address: "", device_key: "", notes: "",
    is_active: true, payment_type: "pix",
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("plans").select("id, name").eq("user_id", user.id).then(({ data }) => setPlans(data || []));
    supabase.from("servers").select("id, name").eq("user_id", user.id).then(({ data }) => setServers(data || []));
  }, [user]);

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name || "", whatsapp_number: client.whatsapp_number || "",
        plan_id: client.plan_id || "", server_id: client.server_id || "",
        price_value: String(client.price_value || ""), due_date: client.due_date || "",
        username: client.username || "", suffix: client.suffix || "",
        password: client.password || "", mac_address: client.mac_address || "",
        device_key: client.device_key || "", notes: client.notes || "",
        is_active: client.is_active ?? true, payment_type: client.payment_type || "pix",
      });
    } else {
      setForm({
        name: "", whatsapp_number: "", plan_id: "", server_id: "",
        price_value: "", due_date: "", username: "", suffix: "",
        password: "", mac_address: "", device_key: "", notes: "",
        is_active: true, payment_type: "pix",
      });
    }
  }, [client, open]);

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      whatsapp_number: form.whatsapp_number || null,
      plan_id: form.plan_id || null,
      server_id: form.server_id || null,
      price_value: parseFloat(form.price_value) || 0,
      due_date: form.due_date || null,
      username: form.username || null,
      suffix: form.suffix || null,
      password: form.password || null,
      mac_address: form.mac_address || null,
      device_key: form.device_key || null,
      notes: form.notes || null,
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
            <Label>Username</Label>
            <Input value={form.username} onChange={e => set("username", e.target.value)} />
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
            <Label>Sufixo</Label>
            <Input value={form.suffix} onChange={e => set("suffix", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Senha</Label>
            <Input value={form.password} onChange={e => set("password", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>MAC Address</Label>
            <Input value={form.mac_address} onChange={e => set("mac_address", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Device Key</Label>
            <Input value={form.device_key} onChange={e => set("device_key", e.target.value)} />
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
