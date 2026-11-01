import { Link, useRouterState } from "@tanstack/react-router";
import { ScanLine, Library, FileText, BookMarked, BarChart3, Save, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

const tabs = [
  { to: "/", label: "Digitalizar", icon: ScanLine },
  { to: "/questoes", label: "Questões salvas", icon: Library },
  { to: "/catalogos", label: "Catálogos", icon: BookMarked },
  { to: "/analise-provas", label: "Análise de Provas", icon: BarChart3 },
  { to: "/documento", label: "Criar documento", icon: FileText },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isReviewPage = pathname === "/revisar";
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card sticky top-0 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <ScanLine className="size-5 text-primary" />
            <span>Digitalizador de Questões</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = pathname === t.to || (t.to !== "/" && pathname.startsWith(t.to));
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            aria-pressed={theme === "dark"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
        <nav className="sm:hidden flex border-t overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = pathname === t.to || (t.to !== "/" && pathname.startsWith(t.to));
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "min-w-20 flex-1 flex flex-col items-center gap-0.5 py-2 text-xs",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className={cn("flex-1", isReviewPage && "pb-28")}>{children}</main>
      <footer className="py-3 text-center text-[10px] text-muted-foreground">
        Criado por Isaac Jose
      </footer>
      {isReviewPage && <ReviewSaveDock />}
    </div>
  );
}

function ReviewSaveDock() {
  const [buttonLabel, setButtonLabel] = useState("Salvar revisão");
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    let previousButton: HTMLButtonElement | null = null;
    let previousDisplay = "";

    const syncButton = () => {
      const target = findReviewSaveButton();
      if (previousButton && previousButton !== target) {
        previousButton.style.display = previousDisplay;
      }
      if (!target) {
        setButtonLabel("Salvar revisão");
        setDisabled(true);
        previousButton = null;
        return;
      }

      if (previousButton !== target) {
        previousDisplay = target.style.display;
        previousButton = target;
      }
      target.style.display = "none";
      setButtonLabel(target.textContent?.trim() || "Salvar revisão");
      setDisabled(target.disabled);
    };

    syncButton();
    const interval = window.setInterval(syncButton, 300);
    return () => {
      window.clearInterval(interval);
      if (previousButton) previousButton.style.display = previousDisplay;
    };
  }, []);

  const clickOriginalSave = () => {
    const target = findReviewSaveButton();
    if (!target || target.disabled) return;
    target.click();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Finalizou a revisão?</p>
          <p className="text-xs text-muted-foreground">Salve a questão aqui, sem precisar voltar para o topo da página.</p>
        </div>
        <Button type="button" className="gap-2" disabled={disabled} onClick={clickOriginalSave} data-review-save-dock="true">
          <Save className="size-4" /> {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function findReviewSaveButton() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button:not([data-review-save-dock])"));
  return buttons.find((button) => button.textContent?.trim().startsWith("Salvar")) ?? null;
}
