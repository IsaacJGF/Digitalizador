import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "./client";

const RETURN_TO_KEY = "digitalizador.auth.return-to";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({ session, user: session?.user ?? null, loading: false });
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error("Não foi possível carregar a sessão do Supabase:", error);
      const session = data.session ?? null;
      setState({ session, user: session?.user ?? null, loading: false });
    }).catch((error: unknown) => {
      if (!active) return;
      console.error("Não foi possível carregar a sessão do Supabase:", error);
      setState({ session: null, user: null, loading: false });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthLoadingScreen({ message = "Verificando acesso..." }: { message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </main>
  );
}

function RedirectToLogin() {
  useEffect(() => {
    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    try {
      window.sessionStorage.setItem(RETURN_TO_KEY, returnTo);
    } catch (error) {
      console.error("Não foi possível salvar a rota de retorno:", error);
    }
    window.location.replace("/login");
  }, []);

  return <AuthLoadingScreen message="Redirecionando para entrar..." />;
}

export function withSupabaseAuth<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function ProtectedRoute(props: P) {
    const { user, loading } = useAuth();

    if (loading) return <AuthLoadingScreen />;
    if (!user) return <RedirectToLogin />;

    return <Component {...props} />;
  }

  ProtectedRoute.displayName = `withSupabaseAuth(${Component.displayName || Component.name || "Route"})`;
  return ProtectedRoute;
}
