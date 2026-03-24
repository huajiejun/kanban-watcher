export function getPaneColumns(count: number) {
  if (count <= 1) {
    return 1;
  }

  if (count >= 4) {
    return 4;
  }

  return count;
}
