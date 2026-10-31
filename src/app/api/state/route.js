import { loadData, storageMode } from "@/lib/server/store.js";
import { geminiConfigured, geminiModel } from "@/lib/server/gemini.js";
import { json } from "@/lib/server/http.js";

export const dynamic = "force-dynamic";

/* The whole shop for the demo account switcher. Also says which storage and AI are connected. */
export async function GET() {
  try {
    const data = await loadData();
    return json({ data, mode: storageMode(), gemini: geminiConfigured(), geminiModel: geminiModel() });
  } catch (e) {
    console.error(e);
    return json({ error: "Could not load the shop data. Check the Supabase settings in .env / Replit Secrets." }, 500);
  }
}
