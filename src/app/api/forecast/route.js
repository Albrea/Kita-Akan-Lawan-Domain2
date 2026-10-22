import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  // RBAC validation
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === "Staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch product snapshot
  const { data: products } = await supabase
    .from("products")
    .select("sku, name, price, stock, threshold");

  // Pull last 30 days of stock out
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: movements } = await supabase
    .from("stock_movements")
    .select("sku, quantity_change")
    .eq("activity", "Stock Out")
    .gte("created_at", thirtyDaysAgo.toISOString());

  const salesMap = {};
  movements?.forEach((m) => {
    salesMap[m.sku] = (salesMap[m.sku] || 0) + Math.abs(m.quantity_change);
  });

  const snapshot = products?.map((p) => ({
    sku: p.sku,
    name: p.name,
    current_stock: p.stock,
    threshold: p.threshold,
    units_sold_last_30_days: salesMap[p.sku] || 0,
    price_myr: p.price,
  }));

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `
You are an expert supply chain and inventory analyst for a retail business in Malaysia using StockNow.
All prices and revenue metrics are in Malaysian Ringgit (MYR).

Current inventory and 30-day outflow data:
${JSON.stringify(snapshot, null, 2)}

Provide an operational restock recommendation in clear, professional markdown:
1. Executive Summary: overall inventory health.
2. Restock Orders Needed: List specific products that need purchase orders (taking a 20% safety stock buffer into account). Include suggested order quantities.
3. Overstock / Low-Velocity Items: Flag items that are not moving.
4. Action Checklist for Store Management.
Keep formatting clean using bold text, tables, and bullet points.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return NextResponse.json({ analysis: response.text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
