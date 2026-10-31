/* Screen languages. Each screen string is written in English in the code and looked up here; anything
   missing falls back to English. Data and records (product names, AI reasons, supplier messages, the
   activity log) stay as they were written, so the record reads the same for everyone. */
import { DICT } from "./i18n-dict.js";

export const LANGS = [["en", "English"], ["ms", "Bahasa Melayu"], ["ta", "தமிழ்"], ["zh", "中文"]];
export const DEFAULT_LANG = "en";
export const HTML_LANG = { en: "en", ms: "ms", ta: "ta", zh: "zh-Hans" };
const COL = { ms: 0, ta: 1, zh: 2 };

/* A key may carry a context before "|" (e.g. "verdict|Close") when the same English word means two things. */
export const translate = (lang, s) => (lang in COL && DICT[s]?.[COL[lang]]) || s.slice(s.indexOf("|") + 1);

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ms: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"],
  ta: ["ஜன.", "பிப்.", "மார்.", "ஏப்.", "மே", "ஜூன்", "ஜூலை", "ஆக.", "செப்.", "அக்.", "நவ.", "டிச."],
  zh: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
};
export const monthName = (lang, en) => (MONTHS[lang] || MONTHS.en)[MONTHS.en.indexOf(en)] || en;

/* "YYYY-MM-DD[ HH:MM]" → "23 Oct 2026 · 08:40" in the chosen language (short: without the year). */
export function dateText(lang, at, short = false) {
  const [d, time] = at.split(" ");
  const [y, m, dd] = d.split("-");
  const mon = (MONTHS[lang] || MONTHS.en)[+m - 1];
  const day = lang === "zh" ? `${short ? "" : `${y}年`}${mon}${+dd}日` : `${+dd} ${mon}${short ? "" : ` ${y}`}`;
  return time && !short ? `${day} · ${time}` : day;
}
