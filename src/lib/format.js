/* Formatting and date helpers shared by the server, the browser and the tests. */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const HORIZON = "the next 30 days";
export const SHOP_TZ = "Asia/Kuala_Lumpur";

/* "Today" is the real date in Malaysia. The demo shop (lib/seed.js) is written around 23 Oct 2026 and
   moved forward to now when it is built, so its alerts and late deliveries stay "N days ago". */
export function shopNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t) => parts.find((p) => p.type === t)?.value || "00";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
}

export const today = () => shopNow().date;
export const monthKey = () => today().slice(0, 7);
export const nowStamp = () => { const n = shopNow(); return `${n.date} ${n.time}`; };

export const rm = (n) => "RM " + Math.round(n).toLocaleString("en-MY");
export const rm2 = (n) => "RM " + Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n) => Math.round(n).toLocaleString("en-MY");
export const pct = (x) => Math.round(x * 100) + "%";
export const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-MY", { maximumFractionDigits: 1 });
export const daysText = (d) => (d === Infinity ? "no recent sales" : d < 1 ? "under 1 day" : Math.round(d) + " days");
export const initials = (name) => name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
export const list = (arr) => (arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1]);
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const fmtAt = (at) => {
  const [d, t] = at.split(" ");
  const [y, m, dd] = d.split("-");
  return `${+dd} ${MONTHS[+m - 1]} ${y}${t ? " · " + t : ""}`;
};
export const shortDate = (d) => fmtAt(d).replace(/ \d{4}$/, "");

const DAY_MS = 86400000;
export const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / DAY_MS);
export const addDays = (d, n) => new Date(new Date(d + "T00:00:00Z").getTime() + n * DAY_MS).toISOString().slice(0, 10);
/* Moves a "YYYY-MM-DD HH:MM" (or date-only) stamp by whole minutes; date-only stamps are read as noon. */
const stampMs = (s) => new Date(s.replace(" ", "T") + (s.length === 10 ? "T12:00" : "") + ":00Z").getTime();
export const minutesBetween = (a, b) => Math.round((stampMs(b) - stampMs(a)) / 60000);
export const shiftStamp = (s, minutes) => {
  const iso = new Date(stampMs(s) + minutes * 60000).toISOString();
  return s.length === 10 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
};
export const monthsEndingAt = (date, n) => {
  const m = +date.slice(5, 7) - 1;
  return Array.from({ length: n }, (_, i) => MONTHS[(((m - n + 1 + i) % 12) + 12) % 12]);
};

let seqCounter = 0;
/* Monotonic ordering key for new rows: the newest row has the largest seq. */
export const nextSeq = () => Date.now() * 1000 + (seqCounter++ % 1000);
export const uid = (p) => p + Math.random().toString(36).slice(2, 10);

/* JSON cannot hold Infinity (ideal plans, products with no sales), so it travels as a marker. */
const INF = "__Infinity__";
export const toJSON = (v) => JSON.stringify(v, (_k, x) => (x === Infinity ? INF : x));
export const fromJSON = (s) => JSON.parse(s, (_k, x) => (x === INF ? Infinity : x));
export const reviveInfinity = (v) => fromJSON(toJSON(v));
export const clone = (v) => fromJSON(toJSON(v));
