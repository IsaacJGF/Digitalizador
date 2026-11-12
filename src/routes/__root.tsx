import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useServerFn } from "@tanstack/react-start";
import { getExternalDatabaseConfig } from "@/lib/external-database.functions";
import { configureExternalPublicClient } from "@/lib/external-database";

const DOCUMENT_SELECTION_KEY = "digitalizador.selecionadas";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const isDocumentPage = typeof window !== "undefined" && window.location.pathname === "/documento";

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
      pathname: typeof window !== "undefined" ? window.location.pathname : "unknown",
    });
  }, [error]);

  const retry = () => {
    router.invalidate();
    reset();
  };

  const clearSelectionAndGoToQuestions = () => {
    clearDocumentSelection();
    window.location.href = "/questoes";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isDocumentPage ? "Não foi possível carregar a criação do documento" : "Esta página não carregou"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDocumentPage
            ? "Isso pode acontecer quando a seleção de questões ficou incompatível, antiga ou com algum dado malformado. Tente novamente ou limpe a seleção e escolha as questões de novo."
            : "Algo deu errado ao carregar esta página. Você pode tentar novamente ou voltar ao início."}
        </p>
        {isDocumentPage && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-left text-xs text-muted-foreground">
            <strong className="text-foreground">Dica:</strong> a aba Criar documento depende das questões selecionadas em “Questões salvas”. Se uma questão foi apagada, alterada ou veio com dados antigos, limpar a seleção costuma resolver.
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={retry}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          {isDocumentPage && (
            <button
              onClick={clearSelectionAndGoToQuestions}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Limpar seleção
            </button>
          )}
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Digitalizador de Questões" },
      { name: "description", content: "Web app to digitize questions from images, organize them, and generate editable Word documents." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Digitalizador de Questões" },
      { property: "og:description", content: "Web app to digitize questions from images, organize them, and generate editable Word documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Digitalizador de Questões" },
      { name: "twitter:description", content: "Web app to digitize questions from images, organize them, and generate editable Word documents." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <ExternalDatabaseGate><Outlet /></ExternalDatabaseGate>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ExternalDatabaseGate({ children }: { children: ReactNode }) {
  const loadConfig = useServerFn(getExternalDatabaseConfig);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void loadConfig().then((result) => {
      if (cancelled) return;
      if (!result.ok) { setError(result.error); return; }
      configureExternalPublicClient(result.config);
      setReady(true);
    }).catch(() => {
      if (!cancelled) setError("Não foi possível carregar a configuração do banco externo. Cadastre os três EXTERNAL_SUPABASE_* em Lovable Secrets. Nenhuma consulta será enviada ao Lovable Cloud.");
    });
    return () => { cancelled = true; };
  }, [loadConfig]);
  if (ready) return children;
  return <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
    <div className="max-w-xl space-y-3" role={error ? "alert" : "status"}>
      <h1 className="text-xl font-semibold">{error ? "Banco externo indisponível" : "Conectando ao banco externo"}</h1>
      {error && <p className="text-sm text-muted-foreground break-words">{error}</p>}
    </div>
  </main>;
}

function clearDocumentSelection() {
  try {
    window.localStorage.removeItem(DOCUMENT_SELECTION_KEY);
    window.sessionStorage.removeItem(DOCUMENT_SELECTION_KEY);
  } catch (error) {
    console.error("Erro ao limpar seleção do documento:", error);
  }
}
