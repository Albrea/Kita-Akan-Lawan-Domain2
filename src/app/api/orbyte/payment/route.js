import { createHmac, timingSafeEqual } from "node:crypto";
import { runPaymentEvent } from "@/lib/server/store.js";
import { json } from "@/lib/server/http.js";

export const dynamic = "force-dynamic";

/* Orbyte Payment calls this when a customer pays (or is refunded). The body is signed with the shared
   secret ORBYTE_WEBHOOK_SECRET: header "x-orbyte-signature: sha256=<hex HMAC of the raw body>".
   Unsigned or wrongly signed requests change nothing. Format: README → "Orbyte Payment interface". */
export async function POST(req) {
  const secret = process.env.ORBYTE_WEBHOOK_SECRET;
  if (!secret) return json({ ok: false, error: "ORBYTE_WEBHOOK_SECRET is not set, so Orbyte Payment events are turned off." }, 503);
  const raw = await req.text();
  const sent = Buffer.from(String(req.headers.get("x-orbyte-signature") || "").replace(/^sha256=/, ""), "hex");
  const want = createHmac("sha256", secret).update(raw).digest();
  if (sent.length !== want.length || !timingSafeEqual(sent, want)) return json({ ok: false, error: "Bad signature." }, 401);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ ok: false, error: "Body must be JSON." }, 400); }
  try {
    const out = await runPaymentEvent(event);
    return json(out, out.ok ? 200 : 422);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Saving failed. Nothing was changed; Orbyte should retry." }, 500);
  }
}
