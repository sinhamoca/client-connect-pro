import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PaymentSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ wuzapi_url: "", wuzapi_token: "" });
  const [connected, setConnected] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("wuzapi_url, wuzapi_token")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setForm({
          wuzapi_url: data.wuzapi_url || "",
          wuzapi_token: data.wuzapi_token || "",
        });
        setConnected(!!(data.wuzapi_url && data.wuzapi_token));
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ wuzapi_url: form.wuzapi_url.trim() || null, wuzapi_token: form.wuzapi_token.trim() || null })
      .eq("user_id", user.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Configurações salvas" });
      setConnected(!!(form.wuzapi_url.trim() && form.wuzapi_token.trim()));
    }
    setSaving(false);
  };

  const testConnection = async () => {
    if (!form.wuzapi_url.trim() || !form.wuzapi_token.trim()) {
      toast({ title: "Preencha URL e Token primeiro", variant: "destructive" });
      return;
    }
    // Save first so the proxy can read credentials
    await handleSave();
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("wuzapi-proxy", {
        body: {
          endpoint: "/chat/presence",
          method: "POST",
          body: { Phone: "5500000000000" },
        },
      });
      if (error) {
        toast({ title: "Falha na conexão", description: error.message, variant: "destructive" });
      } else if (data?.wuzapi_status !== 200) {
        const parsed = typeof data?.wuzapi_response === "string" ? JSON.parse(data.wuzapi_response) : data?.wuzapi_response;
        toast({ title: "WuzAPI respondeu com erro", description: parsed?.error || `Status: ${data?.wuzapi_status}`, variant: "destructive" });
      } else {
        toast({ title: "Conexão bem sucedida!", description: "WuzAPI está respondendo." });
      }
    } catch {
      toast({ title: "Erro de conexão", description: "Não foi possível conectar ao WuzAPI.", variant: "destructive" });
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configure a integração com WhatsApp via WuzAPI</p>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          {connected ? (
            <Wifi className="h-5 w-5 text-success" />
          ) : (
            <WifiOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <h2 className="font-semibold">WhatsApp (WuzAPI)</h2>
            <p className="text-sm text-muted-foreground">
              {connected ? "Configurado" : "Não configurado"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>URL da API</Label>
            <Input
              value={form.wuzapi_url}
              onChange={e => setForm(f => ({ ...f, wuzapi_url: e.target.value }))}
              placeholder="https://sua-instancia.com/api"
            />
          </div>
          <div className="space-y-2">
            <Label>Token de Acesso</Label>
            <Input
              type="password"
              value={form.wuzapi_token}
              onChange={e => setForm(f => ({ ...f, wuzapi_token: e.target.value }))}
              placeholder="Seu token WuzAPI"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
            Testar Conexão
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. Instale e configure o <strong>WuzAPI</strong> na sua VPS</li>
          <li>2. Insira a URL e o Token acima</li>
          <li>3. Os lembretes automáticos usarão esta configuração para enviar mensagens via WhatsApp</li>
          <li>4. Cada mensagem substituirá as variáveis do template pelos dados do cliente</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentSettings;
