import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { BookOpen, LockKeyhole, ArrowRight } from "lucide-react";
import { login } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/dashboard" });
  },
  component: Login,
});

function Login() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await login({
        data: { email: String(data.get("email")).trim(), password: String(data.get("password")) },
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await router.invalidate();
      await router.navigate({ to: "/dashboard" });
    } catch {
      setError("Não foi possível entrar. Verifique a conexão e a configuração do servidor.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="min-h-screen bg-panel text-ink flex items-center justify-center p-5">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-white shadow-xl md:grid-cols-2">
        <section className="bg-ink text-white p-8 md:p-12 flex flex-col justify-between gap-12">
          <div className="flex items-center gap-3 text-2xl font-bold">
            <BookOpen className="size-8" /> LedgerX
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60 mb-4">
              Contabilidade US GAAP
            </p>
            <h1 className="text-3xl font-semibold leading-tight">
              Sua operação financeira em um só lugar.
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-white/70">
              Acesse seu painel para acompanhar lançamentos, faturas e relatórios financeiros.
            </p>
          </div>
          <p className="text-xs text-white/50">Acesso exclusivo para usuários cadastrados.</p>
        </section>
        <section className="p-8 md:p-12">
          <LockKeyhole className="size-8 text-brand mb-6" />
          <h2 className="text-2xl font-semibold">Entrar no sistema</h2>
          <p className="text-sm text-ink3 mt-2 mb-8">Informe suas credenciais para continuar.</p>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                maxLength={254}
                required
                disabled={pending}
                className="w-full rounded-lg border border-line px-3 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="voce@empresa.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={256}
                required
                disabled={pending}
                className="w-full rounded-lg border border-line px-3 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Entrando…" : "Entrar"}
              <ArrowRight className="size-4" />
            </button>
          </form>
          <p className="mt-8 text-xs leading-relaxed text-ink3">
            Para solicitar acesso ou redefinir sua senha, entre em contato com o administrador.
          </p>
        </section>
      </div>
    </main>
  );
}
