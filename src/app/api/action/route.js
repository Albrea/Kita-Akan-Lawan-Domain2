import { runAction } from "@/lib/server/store.js";
import { json, readBody } from "@/lib/server/http.js";

export const dynamic = "force-dynamic";

/* Runs one action as the chosen demo account. Permissions are checked again here, not only in the UI. */
export async function POST(req) {
  const { actorId, type, payload } = await readBody(req);
  if (!actorId || !type) return json({ ok: false, error: "actorId and type are required." }, 400);
  try {
    const out = await runAction(actorId, type, payload || {});
    return json(out); // validation problems come back as ok:false
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Saving failed. Nothing was changed, please try again." }, 500);
  }
}
