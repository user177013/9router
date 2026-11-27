"use client";

import { useMemo } from "react";
import Card from "@/shared/components/Card";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { formatResetTime } from "./utils";
import { AI_PROVIDERS } from "@/shared/constants/providers";

// Mirrors QuotaTable's color ramp so the aggregated bars read identically to
// the per-account rows (green > 70, amber >= 30, red below).
function getColorClasses(remainingPercentage) {
  if (remainingPercentage > 70) {
    return {
      text: "text-green-600 dark:text-green-400",
      bg: "bg-green-500",
      bgLight: "bg-green-500/10",
    };
  }
  if (remainingPercentage >= 30) {
    return {
      text: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-500",
      bgLight: "bg-yellow-500/10",
    };
  }
  return {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500",
    bgLight: "bg-red-500/10",
  };
}

function providerLabel(providerId) {
  return AI_PROVIDERS[providerId]?.name || providerId;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

/**
 * Unified per-provider quota view (#4639). When a user holds several accounts
 * of the same provider, this collapses them into one card: a single "Total"
 * bar that sums used/amount across every account and bucket, with the
 * per-bucket breakdown listed beneath it.
 *
 * Preconditions: `totals` comes from `aggregateProviderTotals` — each entry has
 * `{ provider, accountCount, buckets: [{ name, used, total, remaining, accountCount, resetAt }] }`.
 *
 * @param {Object} props
 * @param {Array<Object>} props.totals - Aggregated provider totals
 * @param {boolean} props.loading - Whether quotas are still fetching
 */
export default function ProviderTotals({ totals, loading = false }) {
  const rows = useMemo(
    () =>
      (totals || [])
        .map((entry) => {
          const totalUsed = entry.buckets.reduce((sum, b) => sum + b.used, 0);
          const totalAmount = entry.buckets.reduce((sum, b) => sum + b.total, 0);
          const overallRemaining =
            totalAmount > 0 ? Math.round(((totalAmount - totalUsed) / totalAmount) * 100) : 0;
          return { ...entry, totalUsed, totalAmount, overallRemaining };
        })
        .sort((a, b) => a.overallRemaining - b.overallRemaining),
    [totals],
  );

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-10 text-text-muted">
          <span className="material-symbols-outlined text-[40px] opacity-30">data_usage</span>
          <p className="mt-2 text-sm">
            {loading
              ? "Calculating totals…"
              : "No summable quota to pool. Switch back to per-account to see every row."}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {rows.map((entry) => {
        const totalColors = getColorClasses(entry.overallRemaining);
        const hasMultiple = entry.accountCount > 1;
        return (
          <Card key={entry.provider} padding="md" className="min-w-0">
            {/* Provider header: icon, name, and how many accounts are pooled */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
                <ProviderIcon
                  src={`/providers/${entry.provider}.png`}
                  alt={entry.provider}
                  size={32}
                  className="size-8 rounded-md object-contain"
                  fallbackText={entry.provider.slice(0, 2).toUpperCase()}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-text-primary">
                    {providerLabel(entry.provider)}
                  </h3>
                  <span
                    className="shrink-0 rounded-full border border-black/10 bg-black/[0.02] px-2 py-0.5 text-[10px] font-medium tabular-nums text-text-muted dark:border-white/10 dark:bg-white/[0.03]"
                    title={`${entry.accountCount} account${entry.accountCount === 1 ? "" : "s"} pooled`}
                  >
                    {entry.accountCount} account{entry.accountCount === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="truncate text-xs text-text-muted">
                  Combined across all active {providerLabel(entry.provider)} accounts
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`text-lg font-semibold tabular-nums ${totalColors.text}`}>
                  {entry.overallRemaining}%
                </span>
              </div>
            </div>

            {/* The single unified bar: every account and bucket summed into one */}
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-text-primary">Total quota</span>
                <span className={`tabular-nums ${totalColors.text}`}>
                  {formatNumber(entry.totalUsed)} / {formatNumber(entry.totalAmount)}
                </span>
              </div>
              <div className={`h-2.5 overflow-hidden rounded-full border border-transparent ${totalColors.bgLight}`}>
                <div
                  className={`h-full transition-all duration-300 ${totalColors.bg}`}
                  style={{ width: `${Math.min(entry.overallRemaining, 100)}%` }}
                />
              </div>
            </div>

            {/* Per-bucket breakdown */}
            {entry.buckets.length > 1 && (
              <div className="mt-3 space-y-2 border-t border-black/5 pt-3 dark:border-white/5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  Breakdown
                </p>
                {entry.buckets.map((bucket) => {
                  const colors = getColorClasses(bucket.remaining);
                  return (
                    <div key={bucket.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-text-primary">{bucket.name}</span>
                          <span className={`shrink-0 tabular-nums ${colors.text}`}>{bucket.remaining}%</span>
                        </div>
                        <div className={`h-1.5 overflow-hidden rounded-full border border-transparent ${colors.bgLight}`}>
                          <div
                            className={`h-full transition-all duration-300 ${colors.bg}`}
                            style={{ width: `${Math.min(bucket.remaining, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <div className="text-xs tabular-nums text-text-primary">
                          {formatNumber(bucket.used)} / {formatNumber(bucket.total)}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {bucket.accountCount > 1 ? `${bucket.accountCount} acct` : "1 acct"}
                          {bucket.resetAt ? ` · ${formatResetTime(bucket.resetAt)}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {hasMultiple && (
              <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
                Pooled quota across {entry.accountCount} accounts.
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
