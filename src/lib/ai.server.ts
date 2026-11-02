// Server only. Any OpenAI-compatible chat completions API.
//
// Defaults to Google Gemini's OpenAI-compatible endpoint, which reads images and PDFs.
//   AI_API_KEY          required
//   AI_BASE_URL         default https://generativelanguage.googleapis.com/v1beta/openai
//   AI_MODEL            fast model for reading documents (default gemini-2.5-flash)
//   AI_MODEL_SMART      model for answering questions (default gemini-2.5-pro)
export function aiConfig(kind: "fast" | "smart" = "fast") {
  const key = process.env.AI_API_KEY?.trim();
  if (!key) throw new Error("AI is not set up on this server. Set AI_API_KEY (see .env.example).");
  const base = (process.env.AI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
  const fast = process.env.AI_MODEL?.trim() || "gemini-2.5-flash";
  const model = kind === "smart" ? process.env.AI_MODEL_SMART?.trim() || (process.env.AI_MODEL?.trim() ? fast : "gemini-2.5-pro") : fast;
  return {
    url: `${base}/chat/completions`,
    model,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}
