import { getSession } from "@/lib/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  redirect,
  useRouterState,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AccountingProvider } from "@/lib/accounting-store";
import { CompanyProvider, useCompanies } from "@/components/company-context";
import { ModalProvider } from "@/components/modal-provider";
import { CashShell } from "@/components/cash-shell";
import { isModuleAvailable } from "@/lib/module-availability";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    const user = await getSession();
    const pathname = location.pathname.replace(/\/+$/, "") || "/";
    const publicRoutes = ["/", "/cadastro"];
    if (user?.must_change_password && pathname !== "/") throw redirect({ to: "/" });
    if (!user && !publicRoutes.includes(pathname)) throw redirect({ to: "/" });
    if (user && !publicRoutes.includes(pathname) && !isModuleAvailable(pathname))
      throw redirect({ to: "/cash-flow" });
    return { user };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "World Business · Contabilidade US GAAP" },
      {
        name: "description",
        content:
          "Sistema contábil US GAAP multi-cliente: lançamentos, faturas, estoque, relatórios e multimoeda.",
      },
      { property: "og:title", content: "World Business · Contabilidade US GAAP" },
      {
        property: "og:description",
        content:
          "Sistema contábil US GAAP multi-cliente: lançamentos, faturas, estoque, relatórios e multimoeda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
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
  const { queryClient, user } = Route.useRouteContext();
  // The URL can change while the previous page is still rendered during navigation.
  // Keep its providers until the new route matches are committed with the Outlet.
  const pathname = useRouterState({
    select: (s) => s.matches[s.matches.length - 1]?.pathname ?? "/",
  });
  if (pathname === "/" || pathname.startsWith("/cadastro") || !user) return <Outlet />;
  return (
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>
        <ModalProvider>
          <CashShell user={user}>
            <CompanyRoutes pathname={pathname} />
          </CashShell>
        </ModalProvider>
      </CompanyProvider>
    </QueryClientProvider>
  );
}
function CompanyRoutes({ pathname }: { pathname: string }) {
  const { activeCompany } = useCompanies();
  if (
    ["/companies", "/users", "/access", "/audit-log"].some(
      (p) => pathname === p || pathname === p + "/",
    )
  )
    return <Outlet key={pathname + (activeCompany?.id ?? "")} />;
  if (pathname.startsWith("/parameters")) return <Outlet key={activeCompany?.id ?? "parameters"} />;
  if (!activeCompany)
    return (
      <div className="p-5">
        Nenhuma empresa ativa disponível. Cadastre uma empresa ou solicite acesso ao administrador.
      </div>
    );
  if (["/cash-flow", "/cash-flow/", "/accounts", "/accounts/"].includes(pathname))
    return <Outlet key={activeCompany.id} />;
  return (
    <AccountingProvider key={activeCompany.id}>
      <Outlet key={activeCompany.id} />
    </AccountingProvider>
  );
}
