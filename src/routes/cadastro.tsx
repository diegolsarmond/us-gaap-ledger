import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, UserPlus } from "lucide-react";
import { register } from "@/lib/auth";

export const Route = createFileRoute("/cadastro")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/cash-flow" });
  },
  head: () => ({ meta: [{ title: "Cadastro de usuário · World Business" }] }),
  component: Registration,
});

function Registration() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const data = {
      name: String(form.get("name")).trim(),
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
      confirmPassword: String(form.get("confirmPassword")),
    };
    setError("");
    if (data.name.length < 2) {
      setError("Informe seu nome com pelo menos 2 caracteres.");
      return;
    }
    if (data.password !== data.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setPending(true);
    try {
      const result = await register({ data });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Não foi possível criar sua conta. Verifique os dados e tente novamente.");
    } finally {
      setPending(false);
    }
  }
  const inputClass =
    "w-full rounded-lg border border-line px-3 py-3 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60";
  return (
    <main className="min-h-screen bg-panel text-ink flex items-center justify-center p-5">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-xl sm:p-10">
        <div className="mb-8 flex items-center gap-3 text-2xl font-bold">
          <BookOpen className="size-8 shrink-0 text-brand" />
          World Business
        </div>
        {success ? (
          <div role="status" className="space-y-5">
            <CheckCircle2 className="size-10 text-brand" />
            <h1 className="text-2xl font-semibold">Conta criada com sucesso!</h1>
            <p className="text-sm text-ink3">
              Você já pode entrar no World Business com seu e-mail e sua senha.
            </p>
            <Link
              to="/"
              className="block rounded-lg bg-brand px-4 py-3 text-center text-sm font-semibold text-white hover:opacity-90"
            >
              Ir para o login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Cadastro de usuário</h1>
            <p className="mb-7 mt-2 text-sm text-ink3">Crie sua conta para acessar o sistema.</p>
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium">
                  Nome completo
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  required
                  disabled={pending}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium">
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
                  className={inputClass}
                  placeholder="voce@empresa.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium">
                  Senha
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  aria-describedby="password-help"
                  required
                  disabled={pending}
                  className={inputClass}
                />
                <p id="password-help" className="mt-2 text-xs text-ink3">
                  Use de 12 a 256 caracteres.
                </p>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium">
                  Confirmar senha
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                  disabled={pending}
                  className={inputClass}
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
                <UserPlus className="size-4" />
                {pending ? "Criando conta…" : "Criar conta"}
              </button>
            </form>
            <Link
              to="/"
              className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              <ArrowLeft className="size-4" />
              Já tenho uma conta
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
