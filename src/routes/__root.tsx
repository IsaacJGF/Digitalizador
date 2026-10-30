import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

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
      { title: "Lovable App" },
      { name: "description", content: "Web app to digitize questions from images, organize them, and generate editable Word documents." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Web app to digitize questions from images, organize them, and generate editable Word documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lovable App" },
      { name: "twitter:description", content: "Web app to digitize questions from images, organize them, and generate editable Word documents." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/20a3b3e0-30ed-4ccd-9b7c-d252d0ab10d4/id-preview-1597754b--7acdfbd4-1023-4ac7-98c1-69fb673e5133.lovable.app-1781709046025.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/20a3b3e0-30ed-4ccd-9b7c-d252d0ab10d4/id-preview-1597754b--7acdfbd4-1023-4ac7-98c1-69fb673e5133.lovable.app-1781709046025.png" },
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
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

function clearDocumentSelection() {
  try {
    window.localStorage.removeItem(DOCUMENT_SELECTION_KEY);
    window.sessionStorage.removeItem(DOCUMENT_SELECTION_KEY);
  } catch (error) {
    console.error("Erro ao limpar seleção do documento:", error);
  }
}
