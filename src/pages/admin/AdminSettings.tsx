import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

export default function AdminSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trialDays, setTrialDays] = useState("30");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "default_trial_days")
        .single();
      if (data) setTrialDays(data.value);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("system_settings")
      .update({ value: trialDays })
      .eq("key", "default_trial_days");

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração salva!" });
    }
    setSaving(false);
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
        <h1 className="text-2xl font-bold">Configurações do Sistema</h1>
        <p className="text-muted-foreground">Defina os parâmetros globais do sistema</p>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-4">Período de Teste</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Quantos dias um novo usuário terá para usar o sistema após se cadastrar.
        </p>
        <div className="space-y-2">
          <Label>Dias padrão de teste</Label>
          <Input
            type="number"
            min="1"
            max="365"
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
        </div>
        <Button className="mt-4" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
