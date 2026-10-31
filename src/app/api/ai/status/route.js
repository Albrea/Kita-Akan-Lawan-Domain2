import { checkGemini } from "@/lib/server/gemini.js";
import { json } from "@/lib/server/http.js";

export const dynamic = "force-dynamic";

/* Makes one small Gemini call and reports whether it worked. The API key never leaves the server. */
export async function GET() {
  return json(await checkGemini());
}
