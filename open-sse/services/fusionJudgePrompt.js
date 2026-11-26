/**
 * Judge prompt construction for fusion combos.
 *
 * This module is dependency-free on purpose: it is imported from both the
 * server (combo.js) and the dashboard UI (FusionTuningModal, to seed and
 * restore the default prompt), so nothing here may pull in server-only
 * modules.
 */

// Template tokens. {{PANEL_RESPONSES}} is mandatory-in-effect (appended when
// absent); {{COUNT}} is the panel size at build time.
export const PANEL_RESPONSES_PLACEHOLDER = "{{PANEL_RESPONSES}}";
export const COUNT_PLACEHOLDER = "{{COUNT}}";

// Shipped default. Per OpenRouter's Fusion design, the judge does NOT merge —
// it analyzes (consensus / contradictions / partial coverage / unique insights
// / blind spots) then writes one answer grounded in that analysis.
export const DEFAULT_JUDGE_PROMPT = [
  `You are the JUDGE in a model-fusion panel. ${COUNT_PLACEHOLDER} expert models independently answered the user's most recent request. Their responses are below, anonymized by source.`,
  "",
  "Do NOT mention that multiple models were used, and do NOT refer to the sources. Produce ONE authoritative final answer addressed directly to the user.",
  "",
  "First, internally analyze the panel along these dimensions: consensus (points most sources agree on — treat as higher-confidence), contradictions (where they disagree — resolve with your own judgment), partial coverage, unique insights only one source surfaced, and blind spots every source missed. Then write the best possible final answer grounded in that analysis — more complete and correct than any single response, with no filler.",
  "",
  "=== PANEL RESPONSES ===",
  `${PANEL_RESPONSES_PLACEHOLDER}`,
  "=== END PANEL RESPONSES ===",
  "",
  "Now write the final answer to the user's original request.",
].join("\n");

/**
 * Build the judge directive.
 *
 * Pre: `answers` is a non-empty array of {text}.
 * Post: returns the final prompt string. `customTemplate` (string) replaces the
 *       default when non-blank; if it omits the panel placeholder, the panel is
 *       appended in the standard block format. Blank/undefined uses the default.
 *
 * @param {Array<{text: string}>} answers
 * @param {string} [customTemplate]
 * @returns {string}
 */
export function buildJudgePrompt(answers, customTemplate) {
  const panel = answers
    .map((a, i) => `[Source ${i + 1}]\n${a.text}`)
    .join("\n\n");

  const tmpl = customTemplate && customTemplate.trim() ? customTemplate : DEFAULT_JUDGE_PROMPT;
  let out = tmpl;
  if (out.includes(PANEL_RESPONSES_PLACEHOLDER)) {
    out = out.replace(new RegExp(PANEL_RESPONSES_PLACEHOLDER.replace(/[{}]/g, "\\$&"), "g"), panel);
  } else {
    out += `\n\n=== PANEL RESPONSES ===\n${panel}\n=== END PANEL RESPONSES ===`;
  }
  out = out.split(COUNT_PLACEHOLDER).join(String(answers.length));
  return out;
}
