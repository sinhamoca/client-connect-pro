import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Wifi, WifiOff, QrCode, LogOut, CheckCircle2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SessionStatus = "disconnected" | "connecting" | "connected" | "unknown";

const PaymentSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ wuzapi_url: "", wuzapi_token: "" });
  const [configured, setConfigured] = useState(false);

  // Session / QR state
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("unknown");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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
        setConfigured(!!(data.wuzapi_url && data.wuzapi_token));
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const callProxy = useCallback(async (endpoint: string, method = "GET", body?: any) => {
    const { data, error } = await supabase.functions.invoke("wuzapi-proxy", {
      body: { endpoint, method, body },
    });
    if (error) throw new Error(error.message);
    const parsed = typeof data?.wuzapi_response === "string"
      ? JSON.parse(data.wuzapi_response)
      : data?.wuzapi_response;
    return { status: data?.wuzapi_status, data: parsed };
  }, []);

  // Check WhatsApp session status
  const checkStatus = useCallback(async () => {
    if (!configured) return;
    setCheckingStatus(true);
    try {
      const res = await callProxy("/session/status", "GET");
      if (res.status === 200 && res.data?.data?.Connected) {
        setSessionStatus("connected");
        setQrCode(null);
      } else {
        setSessionStatus("disconnected");
      }
    } catch {
      setSessionStatus("unknown");
    }
    setCheckingStatus(false);
  }, [configured, callProxy]);

  // Check status on load when configured
  useEffect(() => {
    if (configured && !loading) {
      checkStatus();
    }
  }, [configured, loading, checkStatus]);

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
      const isConfigured = !!(form.wuzapi_url.trim() && form.wuzapi_token.trim());
      setConfigured(isConfigured);
      if (isConfigured) {
        setTimeout(() => checkStatus(), 500);
      }
    }
    setSaving(false);
  };

  // Connect and get QR code
  const connectSession = async () => {
    setConnecting(true);
    setQrCode(null);
    try {
      const res = await callProxy("/session/connect", "POST", {
        Subscribe: ["Message", "ReadReceipt", "Presence"],
        Immediate: true,
      });
      if (res.data?.data?.qrcode) {
        setQrCode(res.data.data.qrcode);
        setSessionStatus("connecting");
        // Poll for connection status
        pollForConnection();
      } else if (res.data?.data?.Connected) {
        setSessionStatus("connected");
        toast({ title: "WhatsApp já está conectado!" });
      } else {
        // Try getting QR separately
        const qrRes = await callProxy("/session/qr", "GET");
        if (qrRes.data?.data?.qrcode) {
          setQrCode(qrRes.data.data.qrcode);
          setSessionStatus("connecting");
          pollForConnection();
        } else {
          toast({ title: "Não foi possível obter QR code", description: JSON.stringify(res.data?.error || "Erro desconhecido"), variant: "destructive" });
        }
      }
    } catch (e: any) {
      toast({ title: "Erro ao conectar", description: e.message, variant: "destructive" });
    }
    setConnecting(false);
  };

  // Poll status every 5s while connecting
  const pollForConnection = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 24) { // 2 minutes max
        clearInterval(interval);
        return;
      }
      try {
        const res = await callProxy("/session/status", "GET");
        if (res.status === 200 && res.data?.data?.Connected) {
          setSessionStatus("connected");
          setQrCode(null);
          clearInterval(interval);
          toast({ title: "WhatsApp conectado com sucesso!" });
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
  };

  // Disconnect / Logout
  const disconnectSession = async () => {
    setDisconnecting(true);
    try {
      await callProxy("/session/disconnect", "POST");
      setSessionStatus("disconnected");
      setQrCode(null);
      toast({ title: "WhatsApp desconectado" });
    } catch (e: any) {
      toast({ title: "Erro ao desconectar", description: e.message, variant: "destructive" });
    }
    setDisconnecting(false);
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

      {/* Credentials Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          {configured ? (
            <Wifi className="h-5 w-5 text-success" />
          ) : (
            <WifiOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <h2 className="font-semibold">Credenciais WuzAPI</h2>
            <p className="text-sm text-muted-foreground">
              {configured ? "Configurado" : "Não configurado"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>URL da API</Label>
            <Input
              value={form.wuzapi_url}
              onChange={e => setForm(f => ({ ...f, wuzapi_url: e.target.value }))}
              placeholder="http://seu-servidor:8080"
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
        </div>
      </div>

      {/* WhatsApp Session Card */}
      {configured && (
        <div className="glass-card rounded-xl p-6 max-w-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {sessionStatus === "connected" ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : sessionStatus === "connecting" ? (
                <Loader2 className="h-5 w-5 animate-spin text-warning" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <h2 className="font-semibold">Sessão WhatsApp</h2>
                <p className="text-sm text-muted-foreground">
                  {sessionStatus === "connected" && "Conectado"}
                  {sessionStatus === "connecting" && "Aguardando leitura do QR Code..."}
                  {sessionStatus === "disconnected" && "Desconectado"}
                  {sessionStatus === "unknown" && "Verificando..."}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={checkStatus} disabled={checkingStatus}>
              <RefreshCw className={`h-4 w-4 ${checkingStatus ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* QR Code display */}
          {qrCode && sessionStatus === "connecting" && (
            <div className="flex flex-col items-center gap-4 mb-6 p-4 bg-white rounded-lg">
              <img
                src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code WhatsApp"
                className="w-64 h-64"
              />
              <p className="text-sm text-gray-600 text-center">
                Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar um aparelho
              </p>
            </div>
          )}

          <div className="flex gap-3">
            {sessionStatus !== "connected" && (
              <Button onClick={connectSession} disabled={connecting}>
                {connecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="mr-2 h-4 w-4" />
                )}
                {qrCode ? "Gerar novo QR Code" : "Conectar WhatsApp"}
              </Button>
            )}
            {sessionStatus === "connected" && (
              <Button variant="destructive" onClick={disconnectSession} disabled={disconnecting}>
                {disconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Desconectar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Help Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. Instale e configure o <strong>WuzAPI</strong> na sua VPS</li>
          <li>2. Insira a URL e o Token acima e salve</li>
          <li>3. Clique em <strong>Conectar WhatsApp</strong> e escaneie o QR Code</li>
          <li>4. Os lembretes automáticos usarão esta conexão para enviar mensagens</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentSettings;
