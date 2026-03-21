export function formatRelativeTime(input?: string, now = new Date()): string {
  if (!input) {
    return "recently";
  }

  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) {
    return "recently";
  }

  const diffMs = now.getTime() - timestamp;
  if (diffMs < 0) {
    return "recently";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
