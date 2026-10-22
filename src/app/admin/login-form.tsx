"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="max-w-sm space-y-3 rounded-lg border border-line bg-surface p-5">
      <label className="flex flex-col gap-1 text-sm">
        Contraseña
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="h-9 rounded-md border border-line bg-bg px-2 text-ink"
        />
      </label>
      <button disabled={pending} className="h-9 w-full rounded-md bg-signal text-sm font-medium text-on-signal disabled:opacity-50">
        Entrar
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-err">
          {state.error}
        </p>
      )}
    </form>
  );
}
