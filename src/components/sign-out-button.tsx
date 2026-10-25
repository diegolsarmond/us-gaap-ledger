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
        className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink disabled:opacity-50"
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
