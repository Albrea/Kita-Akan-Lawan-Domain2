import { loadData } from "@/lib/server/store.js";
import { writeWithGemini } from "@/lib/server/gemini.js";
import { json, readBody } from "@/lib/server/http.js";
import { poOf, userOf } from "@/lib/engine.js";
import { chaseMessage, messageFacts, orderMessage } from "@/lib/messages.js";

export const dynamic = "force-dynamic";

/* Drafts a WhatsApp message to a supplier. A person reads it and sends it; nothing is sent from here. */
export async function POST(req) {
  const { poId, kind, actorId } = await readBody(req);
  const d = await loadData();
  const po = poOf(d, poId);
  if (!po) return json({ error: "Order not found." }, 404);
  const sender = userOf(d, actorId).name;
  const fallback = kind === "chase" ? chaseMessage(d, po, sender) : orderMessage(d, po, sender);
  const out = await writeWithGemini({
    task: kind === "chase"
      ? "Write a short, polite WhatsApp reminder to this supplier asking for a new delivery date. List the items still due."
      : "Write a short, friendly WhatsApp message placing this purchase order. List every item with its quantity and ask the supplier to confirm the delivery date.",
    facts: messageFacts(d, po, kind === "chase" ? "chase" : "order", sender),
    fallback,
    maxTokens: 320,
  });
  return json(out);
}
