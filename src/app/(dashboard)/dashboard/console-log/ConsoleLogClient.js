"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { topmostAnchor } from "@/shared/utils/scrollFollow";

const LOG_LEVEL_COLORS = {
  LOG: "text-green-400",
  INFO: "text-blue-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  DEBUG: "text-purple-400",
};

// Monotonic, stable line id. Module-scoped so ids never collide within a
// session. Keying rows by array index instead would let a top-trim silently
// reuse a DOM node for a *different* line, which is what made the viewport
// drift a line per entry while the reader was copying.
let nextLogId = 1;

function colorLine(line) {
  const match = line.match(/\[(\w+)\]/g);
  const levelTag = match ? match[1]?.replace(/\[|\]/g, "") : null;
  const color = LOG_LEVEL_COLORS[levelTag] || "text-green-400";
  return <span className={color}>{line}</span>;
}

/**
 * Console-log view pinned to the reader's position rather than to the moving
 * tail. The buffer trims its oldest lines once it exceeds `maxLines`; because
 * rows are keyed by a stable id, a trim genuinely removes the old DOM nodes,
 * and the scroll container would otherwise let the visible window slide down
 * a line per entry while the reader is copying (#3838 follow-up).
 *
 * The viewport is anchored to "the stable id of the topmost visible line plus
 * how far the viewport top sits inside that line" and re-pinned after every
 * re-layout. The anchor is only ever read back against the container, so it is
 * independent of the current `scrollTop` and survives both bottom appends (a
 * no-op) and top trims (compensated). New entries therefore never pull the
 * reader in; they surface only when the reader scrolls to the bottom.
 *
 * Preconditions: each log line is a string appended in arrival order; the cap
 * comes from `CONSOLE_LOG_CONFIG.maxLines`.
 * Side effects: reads/writes the module `nextLogId` counter; sets scroll on the
 * container (via `useLayoutEffect`) before paint.
 */
export default function ConsoleLogClient() {
  const [connected, setConnected] = useState(false);
  const [logMap, setLogMap] = useState({});
  const [logIds, setLogIds] = useState([]);
  const logRef = useRef(null);

  // Authoritative line state kept in refs so the one-shot SSE handler always
  // works off the latest values, not the empty state captured at first render.
  const idsRef = useRef([]);
  const mapRef = useRef({});
  // Stable-id anchor of the viewport: { lineId, offset }.
  const anchorRef = useRef(null);
  // True after the one-time "open at the newest line" positioning is done; from
  // then on every re-layout only restores the reader's anchor.
  const positionedRef = useRef(false);

  const commit = (ids, map) => {
    setLogIds(ids);
    setLogMap(map);
  };

  /**
   * Append lines by stable id, trimming oldest past the cap.
   * Preconditions: `lines` is a string list in arrival order.
   * Postcondition: the ordered id list and id->text map are extended, with the
   * oldest ids dropped once the cap is exceeded.
   */
  const addLines = (lines) => {
    if (!Array.isArray(lines) || lines.length === 0) return;
    const ids = idsRef.current.slice();
    const map = { ...mapRef.current };
    for (const text of lines) {
      const id = nextLogId++;
      map[id] = text;
      ids.push(id);
    }
    const cap = CONSOLE_LOG_CONFIG.maxLines;
    if (ids.length > cap) {
      const dropped = ids.splice(0, ids.length - cap);
      for (const id of dropped) delete map[id];
    }
    idsRef.current = ids;
    mapRef.current = map;
    commit(ids, map);
  };

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        addLines(Array.isArray(msg.logs) ? msg.logs : []);
      } else if (msg.type === "line") {
        addLines([msg.line]);
      } else if (msg.type === "lines") {
        addLines(msg.lines);
      } else if (msg.type === "clear") {
        idsRef.current = [];
        mapRef.current = {};
        commit([], {});
        anchorRef.current = null;
        // After a clear the reader is back at the top; re-open at the next
        // newest line.
        positionedRef.current = false;
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
    // One-shot EventSource: `addLines` reads refs, so its identity is not a
    // dependency. Listing it would re-open the stream every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record the topmost visible line as the anchor. Runs on scroll, where it
  // reflects where the reader actually is, before the next re-layout can move
  // anything.
  const captureAnchor = (el) => {
    const rows = Array.from(el.querySelectorAll("[data-log-id]"));
    if (rows.length === 0) {
      anchorRef.current = null;
      return;
    }
    const tops = rows.map((row) => row.offsetTop);
    const { index, offset } = topmostAnchor(tops, el.scrollTop);
    anchorRef.current = { lineId: Number(rows[index].dataset.logId), offset };
  };

  const handleScroll = () => captureAnchor(logRef.current);

  // Re-pin the viewport after every content re-layout (append or top-trim) so
  // the reader's visible window never moves on its own. Runs before paint.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el || logIds.length === 0) return;
    if (!positionedRef.current) {
      // First time: open the console at the newest line, then lock it in as
      // the anchor.
      el.scrollTop = el.scrollHeight;
      positionedRef.current = true;
      captureAnchor(el);
      return;
    }
    const anchor = anchorRef.current;
    if (anchor && anchor.lineId != null) {
      const row = el.querySelector(`[data-log-id="${anchor.lineId}"]`);
      if (row) {
        el.scrollTop = row.offsetTop + anchor.offset;
        return;
      }
    }
    // Anchored line was trimmed off the top (reader was at the very top of a
    // full buffer). Nothing left to hold; re-anchor to the new topmost line.
    captureAnchor(el);
  }, [logIds]);

  const shownIds = logIds;

  return (
    <div className="">
      <Card>
        <div className="flex items-center justify-end px-4 pt-3 pb-2">
          <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
            Clear
          </Button>
        </div>
        <div
          ref={logRef}
          onScroll={handleScroll}
          className="relative bg-black rounded-b-lg p-4 text-xs font-mono h-[calc(100vh-220px)] overflow-y-auto"
        >
          {shownIds.length === 0 ? (
            <span className="text-text-muted">No console logs yet.</span>
          ) : (
            <div className="space-y-0.5">
              {shownIds.map((id) => (
                <div key={id} data-log-id={id}>
                  {colorLine(logMap[id] ?? "")}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
