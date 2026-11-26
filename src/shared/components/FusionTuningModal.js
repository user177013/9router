"use client";

import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import Button from "./Button";
import Badge from "./Badge";
import { DEFAULT_JUDGE_PROMPT, PANEL_RESPONSES_PLACEHOLDER, COUNT_PLACEHOLDER } from "open-sse/services/fusionJudgePrompt.js";

// Presets mirror FUSION_DEFAULTS in open-sse/services/combo.js so the "Balanced"
// card always lands on the same shape the backend falls back to.
const PRESETS = [
  {
    id: "fast",
    title: "Fastest",
    badge: "3s grace · 60s cap",
    badgeVariant: "primary",
    icon: "bolt",
    recommended: false,
    desc: "Quorum of 2 with a short grace window. Drops laggards early so the judge starts sooner. Best for latency-sensitive panels.",
    values: { minPanel: 2, stragglerGraceMs: 3000, panelHardTimeoutMs: 60000 },
  },
  {
    id: "balanced",
    title: "Balanced",
    badge: "Default",
    badgeVariant: "success",
    icon: "tune",
    recommended: true,
    desc: "The shipped defaults: wait for 2 answers, give stragglers an 8-second grace window, and cap the panel at 90 seconds.",
    values: { minPanel: 2, stragglerGraceMs: 8000, panelHardTimeoutMs: 90000 },
  },
  {
    id: "quality",
    title: "Quality",
    badge: "Wait for all",
    badgeVariant: "default",
    icon: "verified",
    recommended: false,
    desc: "Quorum equals the full panel, with a generous 30-second grace and 5-minute cap. Maximizes fusion quality at the cost of wall time.",
    values: { minPanel: "all", stragglerGraceMs: 30000, panelHardTimeoutMs: 300000 },
  },
];

const GRACE_CHIPS = [1000, 3000, 5000, 8000, 15000, 30000];
const CAP_CHIPS = [30000, 60000, 90000, 180000, 300000];

function fmtMs(ms) {
  if (ms >= 60000) {
    const s = ms / 1000;
    return Number.isInteger(s / 60) ? `${s / 60}m` : `${(s / 60).toFixed(1)}m`;
  }
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  return `${ms}ms`;
}

/**
 * Fusion tuning modal.
 *
 * Pre: panelSize >= 2 (fusion with a single model short-circuits on the backend).
 * Post: onSave receives a patch of shape { fusionTuning: {minPanel, stragglerGraceMs, panelHardTimeoutMs} | null }.
 *       null means "drop the override, use backend defaults".
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {string} comboName
 * @param {number} panelSize - number of panel models in the combo (used to clamp minPanel and enable the "all" preset)
 * @param {object|null} current - existing { fusionTuning, judgePrompt } override, or null
 * @param {(patch: {fusionTuning: object|null, judgePrompt: string|null}) => void} onSave
 */
export default function FusionTuningModal({
  isOpen,
  onClose,
  comboName,
  panelSize = 2,
  current = null,
  onSave,
}) {
  const [preset, setPreset] = useState("balanced");
  const [minPanel, setMinPanel] = useState(2);
  const [graceMs, setGraceMs] = useState(8000);
  const [capMs, setCapMs] = useState(90000);
  const [judgePrompt, setJudgePrompt] = useState(DEFAULT_JUDGE_PROMPT);

  const maxPanel = Math.max(2, panelSize);

  // The modal is conditionally mounted, and the parent passes a fresh `current`
  // object on every render. Seed only on the open transition so re-renders
  // while the modal is visible don't clobber in-progress edits.
  const seededForOpen = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      seededForOpen.current = false;
      return;
    }
    if (seededForOpen.current) return;
    seededForOpen.current = true;

    // Detect which preset (if any) the current override matches, otherwise fall
    // back to a custom state when the values don't line up.
    const c = current || {};
    const hasCustom = c.minPanel != null || c.stragglerGraceMs != null || c.panelHardTimeoutMs != null;
    const m = hasCustom ? c.minPanel : 2;
    const g = hasCustom ? c.stragglerGraceMs : 8000;
    const cap = hasCustom ? c.panelHardTimeoutMs : 90000;

    let matched = null;
    for (const p of PRESETS) {
      const pMin = p.values.minPanel === "all" ? panelSize : p.values.minPanel;
      if (pMin === m && p.values.stragglerGraceMs === g && p.values.panelHardTimeoutMs === cap) {
        matched = p.id;
        break;
      }
    }

    setPreset(matched || "custom");
    setMinPanel(Math.min(Math.max(2, m), maxPanel));
    setGraceMs(g);
    setCapMs(cap);

    // Seed the prompt editor. Blank means "use default" on the backend, so a
    // missing/blank stored value falls back to the shipped default text.
    const stored = typeof c.judgePrompt === "string" ? c.judgePrompt : "";
    setJudgePrompt(stored.trim() ? stored : DEFAULT_JUDGE_PROMPT);
  }, [isOpen, current, panelSize, maxPanel]);

  const applyPreset = (p) => {
    setPreset(p.id);
    const m = p.values.minPanel === "all" ? maxPanel : p.values.minPanel;
    setMinPanel(Math.min(Math.max(2, m), maxPanel));
    setGraceMs(p.values.stragglerGraceMs);
    setCapMs(p.values.panelHardTimeoutMs);
  };

  const setCustom = () => {
    setPreset("custom");
  };

  const handleSave = () => {
    const next = { minPanel, stragglerGraceMs: graceMs, panelHardTimeoutMs: capMs };
    // Match the default preset? Drop the tuning override so settings stays clean.
    const isDefaultTuning =
      preset === "balanced" &&
      minPanel === 2 &&
      graceMs === 8000 &&
      capMs === 90000;
    // Blank or default prompt -> no override. Otherwise persist the prompt.
    const trimmed = judgePrompt.trim();
    const promptOverride = trimmed && trimmed !== DEFAULT_JUDGE_PROMPT ? trimmed : null;
    onSave({ fusionTuning: isDefaultTuning ? null : next, judgePrompt: promptOverride });
    onClose();
  };

  const handleReset = () => {
    applyPreset(PRESETS.find((p) => p.id === "balanced"));
    setJudgePrompt(DEFAULT_JUDGE_PROMPT);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Fusion Tuning — ${comboName || "Combo"}`}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted leading-relaxed">
          Controls how long the panel is waited on before the judge starts. Lower the grace and
          hard cap to trade panel completeness for wall time; raise them to maximize fusion
          quality. Quorum caps the number of answers the judge sees.
        </p>

        <div className="flex flex-col gap-2.5">
          {PRESETS.map((p) => {
            const isSelected = preset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => applyPreset(p)}
                className={`relative flex flex-col rounded-xl border p-3 cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary bg-primary/[0.04] shadow-sm"
                    : "border-border/60 hover:border-border hover:bg-black/[0.01] dark:hover:bg-white/[0.01]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border-subtle bg-surface"
                      }`}
                    >
                      {isSelected && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="size-5 rounded flex items-center justify-center shrink-0 text-text-muted">
                      <span className="material-symbols-outlined text-[15px] leading-none select-none inline-block">
                        {p.icon}
                      </span>
                    </span>
                    <span className="text-sm font-medium text-text-main">{p.title}</span>
                    {p.recommended && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <Badge variant={p.badgeVariant} size="sm">
                    {p.badge}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted mt-1.5 pl-6 leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Fine-grained sliders — any edit marks the preset as "custom" */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="material-symbols-outlined text-[15px] text-text-muted">groups</span>
              <span className="font-medium text-text-main">Quorum (min panel answers)</span>
            </div>
            <span className="font-mono font-semibold text-primary text-xs">
              {minPanel === maxPanel && maxPanel > 2 ? "All" : minPanel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="2"
              max={maxPanel}
              step="1"
              value={minPanel}
              onChange={(e) => {
                setMinPanel(Number(e.target.value));
                setCustom();
              }}
              className="flex-1 accent-primary cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none"
            />
            <code className="w-14 shrink-0 rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[11px] text-text-muted text-center">
              {minPanel === maxPanel && maxPanel > 2 ? "All" : minPanel} / {maxPanel}
            </code>
          </div>
          <p className="text-[10px] text-text-muted pl-0.5">
            As soon as this many panel calls succeed, the grace timer starts. Set to the full
            panel ({maxPanel}) to require every answer.
          </p>

          <div className="border-t border-border/40 my-1" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="material-symbols-outlined text-[15px] text-text-muted">timer</span>
              <span className="font-medium text-text-main">Straggler grace window</span>
            </div>
            <span className="font-mono font-semibold text-primary text-xs">{fmtMs(graceMs)}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="60000"
              step="1000"
              value={graceMs}
              onChange={(e) => {
                setGraceMs(Number(e.target.value));
                setCustom();
              }}
              className="flex-1 accent-primary cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none"
            />
            <code className="w-14 shrink-0 rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[11px] text-text-muted text-center">
              {fmtMs(graceMs)}
            </code>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted">Presets:</span>
            {GRACE_CHIPS.map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => { setGraceMs(ms); setCustom(); }}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  graceMs === ms
                    ? "bg-primary text-white font-semibold"
                    : "bg-black/5 dark:bg-white/5 text-text-muted hover:text-text-main"
                }`}
              >
                {fmtMs(ms)}
              </button>
            ))}
          </div>

          <div className="border-t border-border/40 my-1" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="material-symbols-outlined text-[15px] text-text-muted">hourglass_bottom</span>
              <span className="font-medium text-text-main">Panel hard timeout</span>
            </div>
            <span className="font-mono font-semibold text-primary text-xs">{fmtMs(capMs)}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10000"
              max="300000"
              step="5000"
              value={capMs}
              onChange={(e) => {
                setCapMs(Number(e.target.value));
                setCustom();
              }}
              className="flex-1 accent-primary cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none"
            />
            <code className="w-14 shrink-0 rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[11px] text-text-muted text-center">
              {fmtMs(capMs)}
            </code>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted">Presets:</span>
            {CAP_CHIPS.map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => { setCapMs(ms); setCustom(); }}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  capMs === ms
                    ? "bg-primary text-white font-semibold"
                    : "bg-black/5 dark:bg-white/5 text-text-muted hover:text-text-main"
                }`}
              >
                {fmtMs(ms)}
              </button>
            ))}
          </div>
        </div>

        {/* Judge directive editor */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="material-symbols-outlined text-[15px] text-text-muted">edit_note</span>
              <span className="font-medium text-text-main">Judge directive</span>
            </div>
            {judgePrompt.trim() !== DEFAULT_JUDGE_PROMPT ? (
              <Badge variant="primary" size="sm">Custom</Badge>
            ) : (
              <Badge variant="default" size="sm">Default</Badge>
            )}
          </div>
          <textarea
            value={judgePrompt}
            onChange={(e) => setJudgePrompt(e.target.value)}
            rows={8}
            spellCheck={false}
            aria-label="Judge directive"
            className="w-full resize-y rounded-lg border border-border/60 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 font-mono text-[11px] leading-relaxed text-text-main placeholder-text-muted/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Custom judge directive… leave the placeholder to use the default."
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
            <span className="inline-flex items-center gap-1">
              <code className="rounded bg-black/5 dark:bg-white/5 px-1 py-0.5 font-mono text-[10px] text-text-main">{PANEL_RESPONSES_PLACEHOLDER}</code>
              panel responses
            </span>
            <span className="inline-flex items-center gap-1">
              <code className="rounded bg-black/5 dark:bg-white/5 px-1 py-0.5 font-mono text-[10px] text-text-main">{COUNT_PLACEHOLDER}</code>
              panel size
            </span>
            <button
              type="button"
              onClick={() => setJudgePrompt(DEFAULT_JUDGE_PROMPT)}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">restart_alt</span>
              Restore default
            </button>
          </div>
        </div>

        {/* Callout explaining the interplay */}
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 text-xs flex items-start gap-2.5">
          <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">
            tips_and_updates
          </span>
          <div className="text-text-muted leading-relaxed">
            <span className="font-medium text-text-main">How it works: </span>
            Once the quorum is met, stragglers get the grace window before the judge runs.
            The hard cap is the absolute ceiling — even if no quorum is reached, the panel
            closes at this time and the judge proceeds with whatever arrived.
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to default
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save tuning
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
