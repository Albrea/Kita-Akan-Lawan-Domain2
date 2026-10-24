/* JSON responses that keep Infinity intact (see toJSON in lib/format.js). */
import { toJSON } from "../format.js";

export const json = (body, status = 200) =>
  new Response(toJSON(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
