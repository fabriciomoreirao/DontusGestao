/** Pixels per animation frame, increasing smoothly toward the visible edge. */
export function kanbanScrollSpeed(
  pointer: number,
  start: number,
  end: number,
  edge = 72,
) {
  if (end <= start || pointer < start - edge || pointer > end + edge) return 0;
  const width = Math.min(edge, (end - start) / 3);
  if (pointer < start + width)
    return -Math.round(20 * Math.min(1, (start + width - pointer) / width));
  if (pointer > end - width)
    return Math.round(20 * Math.min(1, (pointer - end + width) / width));
  return 0;
}

/** Keep the gutters beside the board usable without crossing the browser edge. */
export function kanbanHorizontalScrollSpeed(
  pointer: number,
  boardLeft: number,
  boardRight: number,
  viewportWidth: number,
) {
  if (pointer < 0 || pointer >= viewportWidth) return 0;
  const left = Math.max(0, boardLeft);
  const right = Math.min(viewportWidth, boardRight);
  return kanbanScrollSpeed(Math.max(left, Math.min(right, pointer)), left, right);
}
