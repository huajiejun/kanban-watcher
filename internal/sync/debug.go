package sync

import (
	"fmt"
	"os"
	"strings"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

const syncTraceEnvKey = "KANBAN_SYNC_TRACE"

func (s *SyncService) tracef(format string, args ...interface{}) {
	if os.Getenv(syncTraceEnvKey) != "1" {
		return
	}
	fmt.Fprintf(os.Stderr, "[sync-trace] "+format+"\n", args...)
}

func traceRawMessage(message []byte) string {
	if len(message) == 0 {
		return `""`
	}
	return strconvQuote(string(message))
}

func tracePatchSummary(patch entryPatch) string {
	return fmt.Sprintf(
		"idx=%d partial=%t type=%s ts=%q content=%s",
		patch.EntryIndex,
		patch.IsPartial,
		patch.Entry.EntryType.Type,
		patch.Entry.Timestamp,
		strconvQuote(limitTraceText(patch.Entry.Content, 160)),
	)
}

func traceProcessEntrySummary(entry *store.ProcessEntry) string {
	if entry == nil {
		return "<nil>"
	}
	return fmt.Sprintf(
		"proc=%s idx=%d type=%s role=%s ts=%s hash=%s content=%s",
		entry.ProcessID,
		entry.EntryIndex,
		entry.EntryType,
		entry.Role,
		entry.EntryTimestamp.Format("2006-01-02T15:04:05.000000000Z07:00"),
		entry.ContentHash,
		strconvQuote(limitTraceText(entry.Content, 160)),
	)
}

func limitTraceText(text string, limit int) string {
	normalized := strings.ReplaceAll(text, "\n", "\\n")
	if limit <= 0 || len(normalized) <= limit {
		return normalized
	}
	return normalized[:limit] + "..."
}

func strconvQuote(text string) string {
	return fmt.Sprintf("%q", text)
}
