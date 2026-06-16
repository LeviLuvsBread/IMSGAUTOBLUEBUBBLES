import { NextResponse } from "next/server";
import { createAdminClient, appOwnerId } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook/verify";
import { BlueBubblesProvider } from "@/lib/provider/bluebubbles";
import { reconcileOutbound, recordInbound } from "@/lib/queue/reconcile";

export const dynamic = "force-dynamic";

// Health check / BlueBubbles "hello-world" pings sometimes use GET.
export async function GET(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { type?: string; data?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { type, data } = payload;
  const admin = createAdminClient();
  const provider = new BlueBubblesProvider("", ""); // normalize() only

  try {
    switch (type) {
      case "new-message": {
        const msg = provider.normalize(data);
        if (msg.isFromMe) {
          await reconcileOutbound(admin, msg);
        } else {
          await recordInbound(admin, msg, appOwnerId());
        }
        break;
      }
      case "updated-message": {
        const msg = provider.normalize(data);
        if (msg.isFromMe) await reconcileOutbound(admin, msg);
        break;
      }
      case "message-error": {
        const msg = provider.normalize(data);
        await reconcileOutbound(admin, { ...msg, errorCode: msg.errorCode || 1 });
        break;
      }
      case "server-url-change": {
        const d = data as { url?: string; serverUrl?: string } | string | undefined;
        const newUrl =
          typeof d === "string" ? d : (d?.url ?? d?.serverUrl ?? null);
        if (newUrl) {
          await admin
            .from("app_settings")
            .update({ bb_url: newUrl, updated_at: new Date().toISOString() })
            .eq("id", true);
        }
        break;
      }
      default:
        // typing-indicator, chat-read-status-changed, etc. — ignore.
        break;
    }
  } catch (e) {
    // Always ack 200 so BlueBubbles doesn't retry-storm; log for diagnosis.
    console.error("[webhook] error", e);
  }

  return NextResponse.json({ ok: true });
}
