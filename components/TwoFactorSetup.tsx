"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff, QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type View = "loading" | "off" | "enrolling" | "on";

export function TwoFactorSetup() {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.[0];
    if (verified) {
      setFactorId(verified.id);
      setView("on");
    } else {
      setView("off");
    }
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const begin = async () => {
    setBusy(true);
    setErr(null);
    // Clear any half-finished (unverified) TOTP factors so re-enrolling works.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    if (error || !data) {
      setErr(error?.message ?? "Couldn't start setup. Try again.");
      setBusy(false);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setView("enrolling");
    setBusy(false);
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || busy) return;
    setBusy(true);
    setErr(null);
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (cErr || !ch) {
      setErr("Couldn't verify. Try again.");
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
    setCode("");
    setQr(null);
    setSecret(null);
    setBusy(false);
    await refresh();
  };

  const disable = async () => {
    if (!factorId || busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    await refresh();
  };

  return (
    <div className="rounded-card bg-surface p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-subhead font-semibold">
            Two-factor authentication
            {view === "on" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-caption2 font-medium text-success">
                <ShieldCheck className="h-3 w-3" /> On
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-caption text-label-secondary">
            Require a code from an authenticator app (Google Authenticator,
            Authy, 1Password) at sign-in.
          </p>
        </div>
      </div>

      {err ? (
        <div className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger">
          {err}
        </div>
      ) : null}

      {view === "loading" ? (
        <div className="mt-3 flex items-center gap-2 text-footnote text-label-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking…
        </div>
      ) : null}

      {view === "off" ? (
        <button
          onClick={begin}
          disabled={busy}
          className="press mt-3 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-subhead font-semibold text-white disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <QrCode className="h-4 w-4" />
          )}
          Enable 2FA
        </button>
      ) : null}

      {view === "enrolling" && qr ? (
        <div className="mt-4 space-y-3">
          <p className="text-footnote text-label-secondary">
            1. Scan this with your authenticator app:
          </p>
          <div className="inline-flex rounded-card bg-white p-3 ring-1 ring-black/[0.08]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`}
              alt="2FA QR code"
              className="h-40 w-40"
            />
          </div>
          {secret ? (
            <p className="text-caption text-label-secondary">
              Or enter this key manually:{" "}
              <code className="select-all rounded bg-fill px-1.5 py-0.5 font-mono text-caption tracking-wide">
                {secret}
              </code>
            </p>
          ) : null}
          <form onSubmit={confirm} className="space-y-2">
            <p className="text-footnote text-label-secondary">
              2. Enter the 6-digit code it shows:
            </p>
            <div className="flex items-center gap-2">
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                aria-label="Authentication code"
                className="w-36 rounded-control bg-fill px-3 py-2 text-center text-body tracking-[0.3em] tabular-nums outline-none focus:bg-fill-secondary"
              />
              <button
                disabled={busy || code.length < 6}
                className="press rounded-control bg-accent px-4 py-2 text-subhead font-semibold text-white disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {view === "on" ? (
        <button
          onClick={disable}
          disabled={busy}
          className="press mt-3 inline-flex items-center gap-2 rounded-control border border-hairline px-4 py-2 text-subhead font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldOff className="h-4 w-4" />
          )}
          Disable 2FA
        </button>
      ) : null}
    </div>
  );
}
