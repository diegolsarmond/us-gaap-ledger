import { useState } from "react";
import { logout } from "@/lib/auth";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border border-red-200/70 bg-red-50/50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:border-red-300 hover:bg-red-100/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={async () => {
          setPending(true);
          setError(false);
          try {
            await logout();
            window.location.assign("/");
          } catch {
            setError(true);
            setPending(false);
          }
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-700 ml-2">
          Unable to sign out. Please try again.
        </span>
      )}
    </div>
  );
}
