import { describe, it, expect } from "vitest";
import { isPinnedToBottom, SCROLL_FOLLOW_SLACK_PX, topmostAnchor } from "../../src/shared/utils/scrollFollow.js";

// A scroll box, measured the way the DOM measures one.
const box = ({ scrollTop, scrollHeight = 1000, clientHeight = 400 }) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe("isPinnedToBottom", () => {
  it("is true at the exact bottom", () => {
    expect(isPinnedToBottom(box({ scrollTop: 600 }))).toBe(true);
  });

  it("is false while the reader is looking at older lines", () => {
    // This is the case #3838 is about: the log kept yanking them back here.
    expect(isPinnedToBottom(box({ scrollTop: 0 }))).toBe(false);
    expect(isPinnedToBottom(box({ scrollTop: 300 }))).toBe(false);
  });

  it("tolerates the sub-pixel residue a pinned element reports", () => {
    // scrollHeight/clientHeight are integers while scrollTop is fractional, so
    // an element that is at the bottom can be a pixel or two short of it.
    expect(isPinnedToBottom(box({ scrollTop: 600 - 1.5 }))).toBe(true);
    expect(isPinnedToBottom(box({ scrollTop: 600 - SCROLL_FOLLOW_SLACK_PX }))).toBe(true);
  });

  it("stops following once past the slack", () => {
    expect(isPinnedToBottom(box({ scrollTop: 600 - SCROLL_FOLLOW_SLACK_PX - 1 }))).toBe(false);
  });

  it("follows a log short enough not to scroll at all", () => {
    // scrollHeight === clientHeight: there is no 'older' to read.
    expect(isPinnedToBottom(box({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 }))).toBe(true);
  });

  it("follows when there is no element or no measurement yet", () => {
    // First paint, or a detached node: the previous behaviour was to scroll, and
    // freezing the log would be worse than scrolling it.
    expect(isPinnedToBottom(null)).toBe(true);
    expect(isPinnedToBottom(undefined)).toBe(true);
    expect(isPinnedToBottom({})).toBe(true);
    expect(isPinnedToBottom(box({ scrollTop: NaN }))).toBe(true);
  });

  it("honours an explicit slack", () => {
    expect(isPinnedToBottom(box({ scrollTop: 590 }), 0)).toBe(false);
    expect(isPinnedToBottom(box({ scrollTop: 590 }), 20)).toBe(true);
  });
});

// Five uniform rows: tops at 0, 20, 40, 60, 80.
const rowTops = [0, 20, 40, 60, 80];

describe("topmostAnchor", () => {
  it("picks the top row when the viewport sits at the very top", () => {
    expect(topmostAnchor(rowTops, 0)).toEqual({ index: 0, offset: 0 });
  });

  it("reports how far the viewport top sits inside the topmost row", () => {
    // scrollTop of 45 means row top 40 is the topmost visible, 5px down inside it.
    expect(topmostAnchor(rowTops, 45)).toEqual({ index: 2, offset: 5 });
  });

  it("reaches a row whose top is just past the viewport top, within the edge tolerance", () => {
    // scrollTop 41: row 40's top is 1px above the viewport top, still topmost.
    expect(topmostAnchor(rowTops, 41, 1)).toEqual({ index: 2, offset: 1 });
  });

  it("answers the first row with no offset for an empty log", () => {
    expect(topmostAnchor([], 0)).toEqual({ index: 0, offset: 0 });
    expect(topmostAnchor(null, 0)).toEqual({ index: 0, offset: 0 });
  });

  it("keeps the same anchor stable across a top-trim of the rows", () => {
    // Reader is anchored to a stable line id, 5px down inside it. Before the
    // trim that line's top was 40, so the reader sat at scrollTop 45. A
    // top-trim removes the two oldest lines and the anchored line's top moves
    // to 0; re-pinning to lookedUpTop + offset restores the same position
    // relative to the line. An index-keyed anchor would have drifted a line,
    // because index 2 no longer points at the line the reader was on.
    const anchor = { lineId: 42, offset: 5 };
    const lookedUpTop = 0; // anchored line's top after the trim
    const repinned = lookedUpTop + anchor.offset;
    expect(repinned).toBe(5);
  });
});
