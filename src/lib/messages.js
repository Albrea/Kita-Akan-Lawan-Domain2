/* Supplier WhatsApp messages. The template is what gets sent when Gemini is off; the facts are what
   Gemini may reword. Both come from the order itself, so the numbers always match the order. */
import { nameOfP, poTotal, productOf, supName, lateDays } from "./engine.js";
import { fmtAt, rm, shortDate } from "./format.js";

export function orderMessage(d, po, senderName) {
  return `Hi ${supName(d, po.sup)}, this is ${d.settings.business}.\n\nPurchase order ${po.code} (${shortDate(po.at.split(" ")[0])}):\n${po.items.map((i) => `• ${nameOfP(d, i.pid)} (${productOf(d, i.pid)?.sku || "-"}) × ${i.qty}`).join("\n")}\n\nTotal ${rm(poTotal(po))}. Please confirm you can deliver by ${fmtAt(po.expectedAt)}.\n\nThank you,\n${senderName}`;
}

export function chaseMessage(d, po, senderName) {
  const due = po.items.filter((i) => i.received < i.qty);
  return `Hi ${supName(d, po.sup)}, a friendly reminder about purchase order ${po.code} from ${shortDate(po.at.split(" ")[0])}:\n${due.map((i) => `• ${nameOfP(d, i.pid)} × ${i.qty - i.received}`).join("\n")}\n\nIt was due on ${fmtAt(po.expectedAt)}. Could you share the new delivery date?\n\nThank you,\n${senderName}`;
}

export function messageFacts(d, po, kind, senderName) {
  const lines = (kind === "order" ? po.items : po.items.filter((i) => i.received < i.qty))
    .map((i) => `- ${nameOfP(d, i.pid)} (SKU ${productOf(d, i.pid)?.sku || "-"}): ${kind === "order" ? i.qty : i.qty - i.received} pieces`);
  return [
    `Message type: ${kind === "order" ? "new purchase order" : `reminder, the order is ${lateDays(po)} days late`}`,
    `Shop: ${d.settings.business}`,
    `Supplier: ${supName(d, po.sup)}`,
    `Order code: ${po.code}, created ${shortDate(po.at.split(" ")[0])}`,
    `Items:\n${lines.join("\n")}`,
    kind === "order" ? `Order total: ${rm(poTotal(po))}` : "",
    `${kind === "order" ? "Deliver by" : "Was due on"}: ${fmtAt(po.expectedAt)}`,
    `Sign off as: ${senderName}`,
  ].filter(Boolean).join("\n");
}
