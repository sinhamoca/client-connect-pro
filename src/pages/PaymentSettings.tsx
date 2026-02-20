import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Wifi, WifiOff, QrCode, LogOut, CheckCircle2, RefreshCw,
} from "lucide-react";

type SessionStatus = "disconnected" | "connecting" | "connected" | "unknown";

const PaymentSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (configured && !loading) checkStatus();
  }, [configured, loading, checkStatus]);

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
        pollForConnection();
      } else if (res.data?.data?.Connected) {
        setSessionStatus("connected");
        toast({ title: "WhatsApp já está conectado!" });
      } else {
        const qrRes = await callProxy("/session/qr", "GET");
        if (qrRes.data?.data?.qrcode) {
          setQrCode(qrRes.data.data.qrcode);
          setSessionStatus("connecting");
          pollForConnection();
        } else {
          toast({ title: "Não foi possível obter QR code", variant: "destructive" });
        }
      }
    } catch (e: any) {
      toast({ title: "Erro ao conectar", description: e.message, variant: "destructive" });
    }
    setConnecting(false);
  };

  const pollForConnection = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 24) { clearInterval(interval); return; }
      try {
        const res = await callProxy("/session/status", "GET");
        if (res.status === 200 && res.data?.data?.Connected) {
          setSessionStatus("connected");
          setQrCode(null);
          clearInterval(interval);
          toast({ title: "WhatsApp conectado com sucesso!" });
        }
      } catch { /* ignore */ }
    }, 5000);
  };

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
        <p className="text-muted-foreground">Gerencie sua conexão WhatsApp</p>
      </div>

      {/* WhatsApp Session Card */}
      {configured ? (
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
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                {qrCode ? "Gerar novo QR Code" : "Conectar WhatsApp"}
              </Button>
            )}
            {sessionStatus === "connected" && (
              <Button variant="destructive" onClick={disconnectSession} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                Desconectar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">WhatsApp não configurado</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            O administrador do sistema precisa configurar as credenciais WuzAPI para sua conta.
            Entre em contato com o administrador para habilitar o envio de mensagens via WhatsApp.
          </p>
        </div>
      )}

      {/* Help Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. O administrador configura as credenciais WuzAPI para sua conta</li>
          <li>2. Clique em <strong>Conectar WhatsApp</strong> e escaneie o QR Code</li>
          <li>3. Os lembretes automáticos usarão esta conexão para enviar mensagens</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentSettings;
