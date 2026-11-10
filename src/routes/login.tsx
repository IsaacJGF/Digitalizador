import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, LogIn, ScanLine, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLoadingScreen, useAuth } from "@/integrations/supabase/auth-context";
import { supabase } from "@/integrations/supabase/client";

const RETURN_TO_KEY = "digitalizador.auth.return-to";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Digitalizador de Questões" }] }),
  component: LoginPage,
});

type AuthMode = "signin" | "signup";

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!authLoading && user) window.location.replace(getPostAuthPath());
  }, [authLoading, user]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        window.location.replace(getPostAuthPath());
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        setNotice("Se o cadastro puder ser concluído, você receberá um e-mail com o link para confirmar a conta.");
        return;
      }

      window.location.replace(getPostAuthPath());
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return <AuthLoadingScreen />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-10">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ScanLine className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Digitalizador</p>
            <h1 className="text-xl font-semibold tracking-tight">Acesse sua conta</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Entre para acessar as ferramentas e os materiais do Digitalizador de Questões.
        </p>

        <form className="space-y-4" onSubmit={onSubmit} aria-busy={busy}>
          <div className="space-y-2">
            <label htmlFor="auth-email" className="text-sm font-medium">E-mail</label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="auth-password" className="text-sm font-medium">Senha</label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground" role="status">
              {notice}
            </p>
          )}

          <Button className="w-full gap-2" type="submit" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : mode === "signin" ? <LogIn className="size-4" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
            {busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <div className="mt-6 border-t pt-5 text-center">
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Ainda não tem uma conta?" : "Já tem uma conta?"}
          </p>
          <button
            type="button"
            className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
              setNotice("");
            }}
            disabled={busy}
          >
            {mode === "signin" ? "Criar conta" : "Voltar para entrar"}
          </button>
        </div>
      </section>
    </main>
  );
}

function getPostAuthPath() {
  let candidate = "/";
  try {
    const queryNext = new URLSearchParams(window.location.search).get("next");
    candidate = queryNext ?? window.sessionStorage.getItem(RETURN_TO_KEY) ?? "/";
    window.sessionStorage.removeItem(RETURN_TO_KEY);
  } catch (storageError) {
    console.error("Não foi possível recuperar a rota de retorno:", storageError);
  }

  try {
    const target = new URL(candidate, window.location.origin);
    if (target.origin === window.location.origin && target.pathname !== "/login") {
      return target.pathname + target.search + target.hash;
    }
  } catch {
    // Ignore malformed or external redirect targets.
  }
  return "/";
}

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Não foi possível concluir a autenticação. Tente novamente.";
  const message = error.message.toLowerCase();
  if (message.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (message.includes("email not confirmed")) return "Confirme seu e-mail pelo link enviado antes de entrar.";
  if (message.includes("password")) return "A senha não atende aos requisitos configurados no Supabase.";
  return error.message;
}
