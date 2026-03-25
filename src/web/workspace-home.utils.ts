function getMaxPaneColumnsForWidth(width: number) {
  if (width >= 1800) {
    return 4;
  }

  if (width >= 1380) {
    return 3;
  }

  return 2;
}

export function getPaneColumns(count: number, width = Number.POSITIVE_INFINITY) {
  if (count <= 1) {
    return 1;
  }

  return Math.min(count, getMaxPaneColumnsForWidth(width));
}
