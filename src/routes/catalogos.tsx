import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, GitMerge, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CATALOG_LABEL, CATALOG_TABLE, type CatalogKind, countUsage, renameInQuestions } from "@/lib/catalogos";

// O cliente Supabase tipa `from(table)` por union — relaxamos para nomes dinâmicos de catálogo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/catalogos")({
  head: () => ({ meta: [{ title: "Catálogos" }] }),
  component: Page,
});

type Item = {
  id: string;
  nome: string;
  ativo: boolean;
  area_id?: string | null;
  conteudo_id?: string | null;
};

const KIND_ORDER: CatalogKind[] = ["area", "conteudo", "subconteudo", "relacionado", "tag", "prova", "instituicao"];

function Page() {
  const [tab, setTab] = useState<CatalogKind>("area");
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Catálogos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre e organize as opções que aparecem nos campos de seleção do cadastro de questões.
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as CatalogKind)}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {KIND_ORDER.map((k) => (
              <TabsTrigger key={k} value={k}>{CATALOG_LABEL[k]}</TabsTrigger>
            ))}
          </TabsList>
          {KIND_ORDER.map((k) => (
            <TabsContent key={k} value={k} className="mt-4">
              <CatalogManager kind={k} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}

function CatalogManager({ kind }: { kind: CatalogKind }) {
  const [items, setItems] = useState<Item[]>([]);
  const [parents, setParents] = useState<Item[]>([]); // areas (for conteudo) or conteudos (for subconteudo)
  const [grandparents, setGrandparents] = useState<Item[]>([]); // areas (for subconteudo display)
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  const [adding, setAdding] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newParentId, setNewParentId] = useState<string>("");

  const [editing, setEditing] = useState<Item | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editParentId, setEditParentId] = useState<string>("");

  const [merging, setMerging] = useState<Item | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const table = CATALOG_TABLE[kind];
  const hasParent = kind === "conteudo" || kind === "subconteudo";
  const parentLabel = kind === "conteudo" ? "Área geral" : "Conteúdo principal";

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db.from(table).select("*").order("nome");
    if (error) toast.error("Falha ao carregar");
    else setItems((data ?? []) as unknown as Item[]);

    if (kind === "conteudo") {
      const { data: areas } = await supabase.from("catalog_areas").select("*").order("nome");
      setParents((areas ?? []) as unknown as Item[]);
    } else if (kind === "subconteudo") {
      const { data: conts } = await supabase.from("catalog_conteudos").select("*").order("nome");
      setParents((conts ?? []) as unknown as Item[]);
      const { data: areas } = await supabase.from("catalog_areas").select("*").order("nome");
      setGrandparents((areas ?? []) as unknown as Item[]);
    }
    setLoading(false);
  }, [kind, table]);

  useEffect(() => {
    load();
  }, [load]);

  // Carrega contagem de uso em lote
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, number> = {};
      for (const it of items) {
        next[it.id] = await countUsage(kind, it.nome);
      }
      if (!cancelled) setUsage(next);
    })();
    return () => { cancelled = true; };
  }, [items, kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.nome.toLowerCase().includes(q));
  }, [items, query]);

  const parentName = (id?: string | null) => parents.find((p) => p.id === id)?.nome ?? "—";
  const grandparentName = (conteudoId?: string | null) => {
    const c = parents.find((p) => p.id === conteudoId);
    return grandparents.find((g) => g.id === c?.area_id)?.nome ?? "—";
  };

  const onAdd = async () => {
    const nome = newNome.trim();
    if (!nome) return;
    if (hasParent && !newParentId) {
      toast.error(`Selecione ${parentLabel}.`);
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = { nome, ativo: true };
    if (kind === "conteudo") payload.area_id = newParentId;
    if (kind === "subconteudo") payload.conteudo_id = newParentId;
    
    const { error } = await db.from(table).insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Já existe um item com esse nome." : "Falha ao criar.");
      return;
    }
    toast.success("Item criado.");
    setAdding(false);
    setNewNome("");
    setNewParentId("");
    load();
  };

  const onToggleAtivo = async (item: Item, ativo: boolean) => {
    const { error } = await db.from(table).update({ ativo }).eq("id", item.id);
    if (error) toast.error("Falha ao atualizar.");
    else {
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, ativo } : i)));
    }
  };

  const startEdit = (item: Item) => {
    setEditing(item);
    setEditNome(item.nome);
    setEditParentId((kind === "conteudo" ? item.area_id : kind === "subconteudo" ? item.conteudo_id : "") ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const nome = editNome.trim();
    if (!nome) return;
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { nome };
      if (kind === "conteudo") patch.area_id = editParentId;
      if (kind === "subconteudo") patch.conteudo_id = editParentId;
      const { error } = await db.from(table).update(patch).eq("id", editing.id);
      if (error) throw error;
      // Cascata: renomear nas questões
      if (nome !== editing.nome) {
        await renameInQuestions(kind, editing.nome, nome);
      }
      toast.success("Item atualizado.");
      setEditing(null);
      load();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (item: Item) => {
    const count = usage[item.id] ?? 0;
    if (count > 0) {
      toast.error(`Não é possível excluir: ${count} questão(ões) usam este item. Mescle ou desative.`);
      return;
    }
    if (!confirm(`Excluir "${item.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await db.from(table).delete().eq("id", item.id);
    if (error) toast.error("Falha ao excluir (talvez existam itens filhos vinculados).");
    else {
      toast.success("Item excluído.");
      load();
    }
  };

  const startMerge = (item: Item) => {
    setMerging(item);
    setMergeTargetId("");
  };

  const doMerge = async () => {
    if (!merging || !mergeTargetId) return;
    const target = items.find((i) => i.id === mergeTargetId);
    if (!target) return;
    if (target.id === merging.id) {
      toast.error("Escolha um destino diferente.");
      return;
    }
    setBusy(true);
    try {
      await renameInQuestions(kind, merging.nome, target.nome);
      const { error } = await db.from(table).delete().eq("id", merging.id);
      if (error) throw error;
      toast.success(`"${merging.nome}" mesclado em "${target.nome}".`);
      setMerging(null);
      load();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao mesclar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Pesquisar…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button onClick={() => setAdding(true)} className="gap-1"><Plus className="size-4" /> Adicionar</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-xl text-sm text-muted-foreground">
          Nenhum item cadastrado.
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {filtered.map((it) => {
            const count = usage[it.id] ?? 0;
            return (
              <div key={it.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{it.nome}</div>
                  {kind === "conteudo" && (
                    <div className="text-xs text-muted-foreground">Área: {parentName(it.area_id)}</div>
                  )}
                  {kind === "subconteudo" && (
                    <div className="text-xs text-muted-foreground">
                      Área: {grandparentName(it.conteudo_id)} · Conteúdo: {parentName(it.conteudo_id)}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {count} questão{count === 1 ? "" : "ões"} usando
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs flex items-center gap-2">
                    <Switch checked={it.ativo} onCheckedChange={(v) => onToggleAtivo(it, v)} />
                    {it.ativo ? "Ativo" : "Inativo"}
                  </Label>
                  <Button size="sm" variant="outline" onClick={() => startEdit(it)} className="gap-1">
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startMerge(it)} className="gap-1" disabled={items.length < 2}>
                    <GitMerge className="size-3.5" /> Mesclar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(it)} title="Excluir">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Diálogo: Adicionar */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) { setAdding(false); setNewNome(""); setNewParentId(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo item — {CATALOG_LABEL[kind]}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {hasParent && (
              <div>
                <Label>{parentLabel}</Label>
                <Select value={newParentId} onValueChange={setNewParentId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {parents.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cadastre antes uma {kind === "conteudo" ? "Área geral" : "Conteúdo principal"}.
                  </p>
                )}
              </div>
            )}
            <div>
              <Label>Nome</Label>
              <Input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Ex.: Cinemática" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button onClick={onAdd} disabled={busy || !newNome.trim() || (hasParent && !newParentId)}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: Editar */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar item</DialogTitle>
            <DialogDescription>Renomear atualiza automaticamente as questões vinculadas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {hasParent && (
              <div>
                <Label>{parentLabel}</Label>
                <Select value={editParentId} onValueChange={setEditParentId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Nome</Label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy || !editNome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: Mesclar */}
      <Dialog open={!!merging} onOpenChange={(o) => !o && setMerging(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesclar "{merging?.nome}"</DialogTitle>
            <DialogDescription>
              Todas as questões vinculadas a "{merging?.nome}" passarão a usar o item escolhido. O item original será removido.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Mesclar em</Label>
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger><SelectValue placeholder="Escolher destino" /></SelectTrigger>
              <SelectContent>
                {items.filter((i) => i.id !== merging?.id).map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerging(null)}>Cancelar</Button>
            <Button onClick={doMerge} disabled={busy || !mergeTargetId}>Mesclar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
