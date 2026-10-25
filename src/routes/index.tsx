import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, LockKeyhole, ArrowRight, Eye, EyeOff } from "lucide-react";
import { changePassword, logout, login } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.user && !context.user.must_change_password) throw redirect({ to: "/cash-flow" });
  },
  component: Login,
  head: () => ({ meta: [{ title: "Sign In · World Business" }] }),
});

const savedAccountKey = "world-business.saved-login-email";

function Login() {
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [rememberAccount, setRememberAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(savedAccountKey);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberAccount(true);
      }
    } catch {
      // Sign-in remains available when browser storage is disabled.
    }
  }, []);
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
      try {
        if (rememberAccount) localStorage.setItem(savedAccountKey, email.trim());
        else localStorage.removeItem(savedAccountKey);
      } catch {
        // Remembering an email is optional and must not interrupt sign-in.
      }
      await router.invalidate();
      await router.navigate({ to: "/cash-flow" });
    } catch {
      setError("Unable to sign in. Check your connection and the server configuration.");
    } finally {
      setPending(false);
    }
  }
  if (user?.must_change_password) return <RequiredPasswordChange />;
  return (
    <main lang="en" className="min-h-screen bg-panel text-ink flex items-center justify-center p-5">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-white shadow-xl md:grid-cols-2">
        <section className="bg-ink text-white p-8 md:p-12 flex flex-col justify-between gap-12">
          <div className="flex items-center gap-3 text-2xl font-bold">
            <BookOpen className="size-8 shrink-0" /> World Business
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60 mb-4">
              US GAAP Accounting
            </p>
            <h1 className="text-3xl font-semibold leading-tight">
              Your financial operations in one place.
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-white/70">
              Access your workspace to track transactions, invoices, and financial reports.
            </p>
          </div>
          <p className="text-xs text-white/50">Access for authorized users only.</p>
        </section>
        <section className="p-8 md:p-12">
          <LockKeyhole className="size-8 text-brand mb-6" />
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="text-sm text-ink3 mt-2 mb-8">Enter your credentials to continue.</p>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
                disabled={pending}
                className="w-full rounded-lg border border-line px-3 py-3 focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  maxLength={256}
                  required
                  disabled={pending}
                  className="w-full rounded-lg border border-line px-3 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-controls="password"
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink3 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rememberAccount}
                  disabled={pending}
                  onChange={(event) => {
                    setRememberAccount(event.target.checked);
                    if (!event.target.checked) {
                      try {
                        localStorage.removeItem(savedAccountKey);
                      } catch {
                        // Browser storage may be unavailable.
                      }
                    }
                  }}
                  aria-describedby="remember-account-help"
                  className="size-4 accent-brand"
                />
                Remember account
              </label>
              <p id="remember-account-help" className="mt-2 text-xs text-ink3">
                Save your email on this device.
              </p>
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
              {pending ? "Signing in…" : "Sign in"}
              <ArrowRight className="size-4" />
            </button>
          </form>
          <p className="mt-8 text-xs leading-relaxed text-ink3">
            Contact your administrator to reset your password.
          </p>
        </section>
      </div>
    </main>
  );
}

function RequiredPasswordChange() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const checks = [
    { label: "At least 12 characters", met: password.length >= 12 },
    {
      label: "Uppercase and lowercase letters",
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    { label: "At least one number", met: /[0-9]/.test(password) },
    { label: "At least one symbol", met: /[^a-zA-Z0-9\s]/.test(password) },
  ];
  const score = checks.filter((check) => check.met).length;
  const strength = !password
    ? "Not entered"
    : password.length < 12 || score < 2
      ? "Weak"
      : score < 4
        ? "Medium"
        : "Strong";
  const strengthColor =
    strength === "Strong"
      ? "bg-emerald-600"
      : strength === "Medium"
        ? "bg-amber-500"
        : "bg-red-500";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirmPassword = String(form.get("confirmPassword"));
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await changePassword({ data: { password, confirmPassword } });
      await router.invalidate();
      await router.navigate({ to: "/cash-flow" });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to change your password. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main lang="en" className="min-h-screen bg-panel text-ink flex items-center justify-center p-5">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-xl">
        <LockKeyhole className="size-8 text-brand mb-6" />
        <h1 className="text-2xl font-semibold">Change your password</h1>
        <p className="mt-2 mb-6 text-sm text-ink3">
          Your password has been reset. Create a new password with at least 12 characters to access
          your workspace.
        </p>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium">
              New password
            </label>
            <div className="relative mt-2">
              <input
                id="new-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={12}
                maxLength={256}
                required
                disabled={pending}
                aria-describedby="password-strength password-guidance"
                className="w-full rounded-lg border border-line p-3 pr-12"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide new password" : "Show new password"}
                aria-controls="new-password"
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            <p id="password-strength" role="status" className="mt-3 text-sm">
              Password strength: <strong>{strength}</strong>
            </p>
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {checks.map((check, index) => (
                <span
                  key={check.label}
                  className={
                    "h-1.5 flex-1 rounded-full " +
                    (password && index < (password.length < 12 ? 1 : score)
                      ? strengthColor
                      : "bg-line")
                  }
                />
              ))}
            </div>
            <ul id="password-guidance" className="mt-3 space-y-1 text-xs text-ink3">
              {checks.map((check) => (
                <li key={check.label} className={check.met ? "text-emerald-700" : ""}>
                  {check.met ? "✓" : "○"} {check.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink3">
              Strength is an estimate. Use a unique password and avoid common words or personal
              details.
            </p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium">
              Confirm new password
            </label>
            <div className="relative mt-2">
              <input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirmation ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
                disabled={pending}
                className="w-full rounded-lg border border-line p-3 pr-12"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => setShowConfirmation((value) => !value)}
                aria-label={
                  showConfirmation ? "Hide password confirmation" : "Show password confirmation"
                }
                aria-controls="confirm-password"
                aria-pressed={showConfirmation}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {showConfirmation ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={pending}
            className="w-full rounded-lg bg-brand p-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save new password"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="w-full text-sm text-brand"
            onClick={async () => {
              await logout();
              await router.invalidate();
            }}
          >
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
