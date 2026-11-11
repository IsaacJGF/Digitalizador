import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, GitMerge, Loader2, Search, ChevronDown, ChevronRight, GitBranch, Layers3, CircleDot } from "lucide-react";
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

const KIND_ORDER: CatalogKind[] = ["relacionado", "tag", "prova", "instituicao"];
type TreeKind = Extract<CatalogKind, "area" | "conteudo" | "subconteudo">;

function Page() {
  const [tab, setTab] = useState("estrutura");
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Catálogos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre e organize as opções que aparecem nos campos de seleção do cadastro de questões.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="estrutura">Estrutura de conteúdos</TabsTrigger>
            {KIND_ORDER.map((kind) => (
              <TabsTrigger key={kind} value={kind}>{CATALOG_LABEL[kind]}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="estrutura" className="mt-4">
            <CatalogTreeManager />
          </TabsContent>
          {KIND_ORDER.map((kind) => (
            <TabsContent key={kind} value={kind} className="mt-4">
              <CatalogManager kind={kind} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}

function CatalogTreeManager() {
  const [areas, setAreas] = useState<Item[]>([]);
  const [contents, setContents] = useState<Item[]>([]);
  const [subcontents, setSubcontents] = useState<Item[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedContents, setExpandedContents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [addingKind, setAddingKind] = useState<TreeKind | null>(null);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");

  const [editing, setEditing] = useState<{ kind: TreeKind; item: Item } | null>(null);
  const [editName, setEditName] = useState("");
  const [editParentId, setEditParentId] = useState("");

  const [merging, setMerging] = useState<{ kind: TreeKind; item: Item } | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [areaResult, contentResult, subcontentResult] = await Promise.all([
      db.from(CATALOG_TABLE.area).select("*").order("nome"),
      db.from(CATALOG_TABLE.conteudo).select("*").order("nome"),
      db.from(CATALOG_TABLE.subconteudo).select("*").order("nome"),
    ]);

    if (areaResult.error || contentResult.error || subcontentResult.error) {
      toast.error("Falha ao carregar a estrutura do catálogo.");
      setLoading(false);
      return;
    }

    const nextAreas = (areaResult.data ?? []) as Item[];
    const nextContents = (contentResult.data ?? []) as Item[];
    const nextSubcontents = (subcontentResult.data ?? []) as Item[];
    setAreas(nextAreas);
    setContents(nextContents);
    setSubcontents(nextSubcontents);
    setExpandedAreas(new Set(nextAreas.map((item) => item.id)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = [
        ...areas.map((item) => ({ kind: "area" as const, item })),
        ...contents.map((item) => ({ kind: "conteudo" as const, item })),
        ...subcontents.map((item) => ({ kind: "subconteudo" as const, item })),
      ];
      const entries = await Promise.all(rows.map(async ({ kind, item }) =>
        [item.id, await countUsage(kind, item.nome)] as const
      ));
      if (!cancelled) setUsage(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [areas, contents, subcontents]);

  const itemsFor = (kind: TreeKind) => kind === "area" ? areas : kind === "conteudo" ? contents : subcontents;
  const childrenFor = (kind: TreeKind, id: string) =>
    kind === "area"
      ? contents.filter((item) => item.area_id === id)
      : kind === "conteudo"
        ? subcontents.filter((item) => item.conteudo_id === id)
        : [];

  const setTreeItems = (kind: TreeKind, update: (items: Item[]) => Item[]) => {
    if (kind === "area") setAreas(update);
    else if (kind === "conteudo") setContents(update);
    else setSubcontents(update);
  };

  const parentOptions = (kind: TreeKind) => kind === "conteudo" ? areas : contents;
  const parentLabel = (kind: TreeKind) => kind === "conteudo" ? "Área geral" : "Conteúdo principal";

  const openAdd = (kind: TreeKind, parentId = "") => {
    setAddingKind(kind);
    setNewName("");
    setNewParentId(parentId);
  };

  const openEdit = (kind: TreeKind, item: Item) => {
    setEditing({ kind, item });
    setEditName(item.nome);
    setEditParentId((kind === "conteudo" ? item.area_id : kind === "subconteudo" ? item.conteudo_id : "") ?? "");
  };

  const onAdd = async () => {
    if (!addingKind) return;
    const nome = newName.trim();
    if (!nome) return;
    if (addingKind !== "area" && !newParentId) {
      toast.error("Selecione " + parentLabel(addingKind) + ".");
      return;
    }

    setBusy(true);
    const payload: Record<string, unknown> = { nome, ativo: true };
    if (addingKind === "conteudo") payload.area_id = newParentId;
    if (addingKind === "subconteudo") payload.conteudo_id = newParentId;
    const { error } = await db.from(CATALOG_TABLE[addingKind]).insert(payload);
    setBusy(false);

    if (error) {
      toast.error(error.message?.includes("duplicate") ? "Já existe um item com esse nome." : "Falha ao criar o item.");
      return;
    }

    if (addingKind === "conteudo") setExpandedAreas((current) => new Set(current).add(newParentId));
    if (addingKind === "subconteudo") {
      setExpandedAreas((current) => new Set(current).add(contents.find((item) => item.id === newParentId)?.area_id ?? ""));
      setExpandedContents((current) => new Set(current).add(newParentId));
    }
    toast.success("Item criado.");
    setAddingKind(null);
    setNewName("");
    setNewParentId("");
    void load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const nome = editName.trim();
    if (!nome) return;
    if (editing.kind !== "area" && !editParentId) {
      toast.error("Selecione " + parentLabel(editing.kind) + ".");
      return;
    }

    setBusy(true);
    try {
      const patch: Record<string, unknown> = { nome };
      if (editing.kind === "conteudo") patch.area_id = editParentId;
      if (editing.kind === "subconteudo") patch.conteudo_id = editParentId;
      const { error } = await db.from(CATALOG_TABLE[editing.kind]).update(patch).eq("id", editing.item.id);
      if (error) throw error;
      if (nome !== editing.item.nome) await renameInQuestions(editing.kind, editing.item.nome, nome);
      toast.success("Item atualizado.");
      setEditing(null);
      void load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao salvar o item.");
    } finally {
      setBusy(false);
    }
  };

  const onToggleActive = async (kind: TreeKind, item: Item, ativo: boolean) => {
    const { error } = await db.from(CATALOG_TABLE[kind]).update({ ativo }).eq("id", item.id);
    if (error) {
      toast.error("Falha ao atualizar o item.");
      return;
    }
    setTreeItems(kind, (current) => current.map((row) => row.id === item.id ? { ...row, ativo } : row));
  };

  const onDelete = async (kind: TreeKind, item: Item) => {
    const count = usage[item.id] ?? 0;
    if (count > 0) {
      toast.error("Não é possível excluir: " + count + " questão(ões) usam este item. Mescle ou desative.");
      return;
    }
    if (childrenFor(kind, item.id).length > 0) {
      toast.error("Antes de excluir, remova ou mova os itens que dependem deste item.");
      return;
    }
    if (!confirm("Excluir \"" + item.nome + "\"? Esta ação não pode ser desfeita.")) return;
    const { error } = await db.from(CATALOG_TABLE[kind]).delete().eq("id", item.id);
    if (error) {
      toast.error("Falha ao excluir o item.");
      return;
    }
    toast.success("Item excluído.");
    void load();
  };

  const openMerge = (kind: TreeKind, item: Item) => {
    if (childrenFor(kind, item.id).length > 0) {
      toast.error("Antes de mesclar, mova ou mescle os itens filhos.");
      return;
    }
    setMerging({ kind, item });
    setMergeTargetId("");
  };

  const mergeOptions = merging
    ? itemsFor(merging.kind).filter((item) => {
        if (item.id === merging.item.id) return false;
        if (merging.kind === "conteudo") return item.area_id === merging.item.area_id;
        if (merging.kind === "subconteudo") return item.conteudo_id === merging.item.conteudo_id;
        return true;
      })
    : [];

  const doMerge = async () => {
    if (!merging || !mergeTargetId) return;
    const target = mergeOptions.find((item) => item.id === mergeTargetId);
    if (!target) return;

    setBusy(true);
    try {
      await renameInQuestions(merging.kind, merging.item.nome, target.nome);
      const { error } = await db.from(CATALOG_TABLE[merging.kind]).delete().eq("id", merging.item.id);
      if (error) throw error;
      toast.success("\"" + merging.item.nome + "\" mesclado em \"" + target.nome + "\".");
      setMerging(null);
      void load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao mesclar o item.");
    } finally {
      setBusy(false);
    }
  };

  const renderActions = (kind: TreeKind, item: Item) => {
    const canMerge = childrenFor(kind, item.id).length === 0 && itemsFor(kind).length > 1;
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
        <Label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Switch checked={item.ativo} onCheckedChange={(value) => void onToggleActive(kind, item, value)} aria-label={"Ativar " + item.nome} />
          <span>{item.ativo ? "Ativo" : "Inativo"}</span>
        </Label>
        <Button size="sm" variant="outline" onClick={() => openEdit(kind, item)} className="gap-1">
          <Pencil className="size-3.5" /><span className="hidden sm:inline">Editar</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => openMerge(kind, item)} className="gap-1" disabled={!canMerge} title={canMerge ? "Mesclar item" : "Remova ou mova os itens filhos antes de mesclar"}>
          <GitMerge className="size-3.5" /><span className="hidden sm:inline">Mesclar</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={() => void onDelete(kind, item)} title="Excluir" aria-label={"Excluir " + item.nome}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    );
  };

  const toggleArea = (id: string) => setExpandedAreas((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleContent = (id: string) => setExpandedContents((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const expandAll = () => {
    setExpandedAreas(new Set(areas.map((item) => item.id)));
    setExpandedContents(new Set(contents.map((item) => item.id)));
  };

  const collapseAll = () => {
    setExpandedAreas(new Set());
    setExpandedContents(new Set());
  };

  const addParentChoices = addingKind ? parentOptions(addingKind) : [];
  const editParentChoices = editing ? parentOptions(editing.kind) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-semibold">Árvore de conteúdos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra cada ramo para navegar pelas áreas, conteúdos principais e subconteúdos.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {areas.length} áreas · {contents.length} conteúdos · {subcontents.length} subconteúdos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={expandAll}>Expandir tudo</Button>
          <Button size="sm" variant="outline" onClick={collapseAll}>Recolher tudo</Button>
          <Button size="sm" onClick={() => openAdd("area")} className="gap-1">
            <Plus className="size-4" /> Adicionar área
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : areas.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center">
          <GitBranch className="mx-auto mb-3 size-8 text-primary" />
          <p className="font-medium">A árvore ainda não tem áreas.</p>
          <p className="mt-1 text-sm text-muted-foreground">Adicione uma área geral para começar a organizar os conteúdos.</p>
          <Button className="mt-4 gap-1" onClick={() => openAdd("area")}><Plus className="size-4" /> Adicionar área</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {areas.map((area) => {
            const areaContents = contents.filter((item) => item.area_id === area.id);
            const areaExpanded = expandedAreas.has(area.id);
            return (
              <section key={area.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <Button size="icon" variant="ghost" onClick={() => toggleArea(area.id)} aria-label={areaExpanded ? "Recolher " + area.nome : "Expandir " + area.nome}>
                    {areaExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </Button>
                  <GitBranch className="size-5 shrink-0 text-primary" />
                  <div className="min-w-[160px] flex-1">
                    <div className="font-semibold">{area.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {usage[area.id] ?? 0} questão(ões) · {areaContents.length} conteúdo(s) principal(is)
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openAdd("conteudo", area.id)} className="gap-1">
                    <Plus className="size-3.5" /><span>Conteúdo</span>
                  </Button>
                  {renderActions("area", area)}
                </div>

                {areaExpanded && (
                  <div className="ml-5 space-y-2 border-l-2 border-primary/20 pb-4 pl-4 pr-3 sm:ml-8 sm:pl-5">
                    {areaContents.length === 0 ? (
                      <p className="py-3 text-sm text-muted-foreground">Nenhum conteúdo principal nesta área.</p>
                    ) : areaContents.map((content) => {
                      const contentSubcontents = subcontents.filter((item) => item.conteudo_id === content.id);
                      const contentExpanded = expandedContents.has(content.id);
                      return (
                        <div key={content.id} className="relative rounded-lg border bg-muted/30">
                          <div className="flex flex-wrap items-center gap-2 p-3">
                            <span className="absolute -left-[1.35rem] top-6 h-px w-5 bg-primary/25 sm:-left-[1.6rem] sm:w-6" />
                            <Button size="icon" variant="ghost" onClick={() => toggleContent(content.id)} aria-label={contentExpanded ? "Recolher " + content.nome : "Expandir " + content.nome}>
                              {contentExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </Button>
                            <Layers3 className="size-4 shrink-0 text-primary" />
                            <div className="min-w-[140px] flex-1">
                              <div className="font-medium">{content.nome}</div>
                              <div className="text-xs text-muted-foreground">
                                {usage[content.id] ?? 0} questão(ões) · {contentSubcontents.length} subconteúdo(s)
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => openAdd("subconteudo", content.id)} className="gap-1">
                              <Plus className="size-3.5" /><span>Subconteúdo</span>
                            </Button>
                            {renderActions("conteudo", content)}
                          </div>

                          {contentExpanded && (
                            <div className="ml-7 space-y-2 border-l border-dashed border-border pb-3 pl-4 pr-3">
                              {contentSubcontents.length === 0 ? (
                                <p className="py-2 text-sm text-muted-foreground">Nenhum subconteúdo neste ramo.</p>
                              ) : contentSubcontents.map((subcontent) => (
                                <div key={subcontent.id} className="relative flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2">
                                  <span className="absolute -left-4 top-1/2 h-px w-4 bg-border" />
                                  <CircleDot className="size-4 shrink-0 text-primary/80" />
                                  <div className="min-w-[130px] flex-1">
                                    <div className="text-sm font-medium">{subcontent.nome}</div>
                                    <div className="text-xs text-muted-foreground">{usage[subcontent.id] ?? 0} questão(ões)</div>
                                  </div>
                                  {renderActions("subconteudo", subcontent)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={!!addingKind} onOpenChange={(open) => { if (!open) { setAddingKind(null); setNewName(""); setNewParentId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo item — {addingKind ? CATALOG_LABEL[addingKind] : ""}</DialogTitle>
            <DialogDescription>O item será adicionado ao ramo correspondente da estrutura.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {addingKind && addingKind !== "area" && (
              <div className="space-y-1.5">
                <Label>{parentLabel(addingKind)}</Label>
                <Select value={newParentId} onValueChange={setNewParentId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {addParentChoices.map((parent) => <SelectItem key={parent.id} value={parent.id}>{parent.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome do item" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingKind(null)}>Cancelar</Button>
            <Button onClick={() => void onAdd()} disabled={busy || !newName.trim() || (!!addingKind && addingKind !== "area" && !newParentId)}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar item</DialogTitle>
            <DialogDescription>Renomear o item também atualiza as questões vinculadas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editing && editing.kind !== "area" && (
              <div className="space-y-1.5">
                <Label>{parentLabel(editing.kind)}</Label>
                <Select value={editParentId} onValueChange={setEditParentId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {editParentChoices.map((parent) => <SelectItem key={parent.id} value={parent.id}>{parent.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => void saveEdit()} disabled={busy || !editName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!merging} onOpenChange={(open) => { if (!open) setMerging(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesclar “{merging?.item.nome}”</DialogTitle>
            <DialogDescription>
              As questões vinculadas passarão a usar o item escolhido e o item de origem será removido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Mesclar em</Label>
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger><SelectValue placeholder="Escolher destino" /></SelectTrigger>
              <SelectContent>
                {mergeOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerging(null)}>Cancelar</Button>
            <Button onClick={() => void doMerge()} disabled={busy || !mergeTargetId}>Mesclar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
