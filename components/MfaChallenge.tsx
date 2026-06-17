"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { authInputCls, authButtonCls } from "@/lib/auth-ui";

export function MfaChallenge({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (error || !totp) {
        setErr("No authenticator is set up on this account.");
      } else {
        setFactorId(totp.id);
      }
      setLoading(false);
    })();
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || busy) return;
    setBusy(true);
    setErr(null);
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (cErr || !ch) {
      setErr("Couldn't start verification. Try again.");
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code: code.trim(),
    });
    if (vErr) {
      setErr("That code didn't match. Try again.");
      setBusy(false);
      return;
    }
    router.refresh();
    router.replace(redirectTo || "/");
  };

  const cancel = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <h2 className="text-callout font-semibold">Two-factor authentication</h2>
      </div>
      <p className="text-footnote text-label-secondary">
        Enter the 6-digit code from your authenticator app to finish signing in.
      </p>

      {err ? (
        <div className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger">
          {err}
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          aria-label="Authentication code"
          className={`${authInputCls} text-center text-title3 tracking-[0.5em] tabular-nums`}
        />
        <button
          disabled={busy || loading || code.length < 6}
          className={authButtonCls}
        >
          {busy ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            "Verify & sign in"
          )}
        </button>
      </form>

      <button
        onClick={cancel}
        className="mt-4 block w-full text-center text-footnote text-label-secondary hover:text-label"
      >
        Cancel and sign out
      </button>
    </div>
  );
}
