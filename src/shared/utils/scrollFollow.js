// Should a scrolling log keep following its own tail?
//
// The console log wrote `scrollTop = scrollHeight` on every append, so a reader
// looking at an older line was dragged back to the bottom by the next entry.
// Something is always appending — a fan-out to several models, a background
// token refresh — which is what turns an awkward behaviour into an unreadable
// one (#3838).
//
// Follow mode is therefore a property of where the reader already is: at the
// bottom means "keep me there", anywhere else means "leave me alone".

/**
 * How far from the bottom still counts as "at the bottom", in CSS pixels.
 *
 * Not zero. `scrollHeight` and `clientHeight` are integers while `scrollTop` is
 * fractional under a non-integer device pixel ratio, so an element pinned to
 * its bottom routinely reports a residue of a pixel or two. An exact comparison
 * would drop the reader out of follow mode without them having scrolled.
 */
export const SCROLL_FOLLOW_SLACK_PX = 8;

/**
 * True when `el` is scrolled to (or within `slack` of) its bottom.
 *
 * A missing element answers true: nothing has been painted yet, and the first
 * paint of a log should land at the newest line.
 */
export function isPinnedToBottom(el, slack = SCROLL_FOLLOW_SLACK_PX) {
  if (!el) return true;
  const { scrollTop, scrollHeight, clientHeight } = el;
  const measured = [scrollTop, scrollHeight, clientHeight];
  if (!measured.every((n) => typeof n === "number" && Number.isFinite(n))) {
    // A detached or unmeasured node reports nothing useful; following is the
    // behaviour that was there before, so keep it rather than freezing the log.
    return true;
  }
  return scrollHeight - scrollTop - clientHeight <= slack;
}

/**
 * Which line is the topmost one the viewport is resting on, and how far down
 * inside that line the viewport top sits.
 *
 * `offsetTops` are each line's top in content coordinates (ascending); reading
 * them back against the container means they are independent of the current
 * `scrollTop`, so the result is stable across re-renders and top-trims.
 *
 * Returns the topmost line's positional `index` and `offset`, where offset is
 * how far the viewport top sits *below* the top of that line (its above-viewport
 * gap, 0 when the line is flush with the top). The caller stores the anchored
 * line's stable id plus `offset`, re-looks-up that id after the next update,
 * and re-pins `scrollTop` to `offsetTops[indexById] + offset` so the same line
 * stays exactly where the reader left it (#3838 follow-up: top-trims used to
 * drag the reader down a line at a time).
 *
 * An empty list answers the first line with no offset: nothing is anchored, so
 * the caller has nothing to restore and the viewport stays put.
 */
export function topmostAnchor(offsetTops, scrollTop, edgeTolerancePx = 1) {
  if (!Array.isArray(offsetTops) || offsetTops.length === 0) {
    return { index: 0, offset: 0 };
  }
  let index = 0;
  for (let i = 0; i < offsetTops.length; i++) {
    if (offsetTops[i] <= scrollTop + edgeTolerancePx) index = i;
  }
  return { index, offset: scrollTop - offsetTops[index] };
}
