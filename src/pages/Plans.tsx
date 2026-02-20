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
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Plans = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", duration_months: "1", num_screens: "1" });

  const fetchPlans = async () => {
    if (!user) return;
    const { data } = await supabase.from("plans").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setPlans(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, [user]);

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, duration_months: String(editing.duration_months), num_screens: String(editing.num_screens) });
    } else {
      setForm({ name: "", duration_months: "1", num_screens: "1" });
    }
  }, [editing, modalOpen]);

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      user_id: user.id, name: form.name.trim(),
      duration_months: parseInt(form.duration_months) || 1,
      num_screens: parseInt(form.num_screens) || 1,
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
              <TableHead>Duração (meses)</TableHead>
              <TableHead>Telas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : plans.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Nenhum plano cadastrado</TableCell></TableRow>
            ) : plans.map(plan => (
              <TableRow key={plan.id} className="border-border/30">
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell>{plan.duration_months}</TableCell>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Plano" : "Novo Plano"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Duração (meses)</Label><Input type="number" min="1" value={form.duration_months} onChange={e => setForm(f => ({ ...f, duration_months: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Nº Telas</Label><Input type="number" min="1" value={form.num_screens} onChange={e => setForm(f => ({ ...f, num_screens: e.target.value }))} /></div>
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
