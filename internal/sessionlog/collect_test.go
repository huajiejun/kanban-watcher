package sessionlog

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

func TestCollectSnapshotsSkipsWorkspacesWithoutSessionAndMissingLogs(t *testing.T) {
	baseDir := t.TempDir()
	sessionID := "d7e7140c-669f-46ab-a7df-f76d31508a53"
	processDir := filepath.Join(baseDir, "sessions", "d7", sessionID, "processes")
	if err := os.MkdirAll(processDir, 0o755); err != nil {
		t.Fatalf("mkdir process dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(processDir, "latest.jsonl"), []byte(
		"{\"Stdout\":\"{\\\"type\\\":\\\"user\\\",\\\"message\\\":{\\\"content\\\":\\\"hello\\\"},\\\"session_id\\\":\\\""+sessionID+"\\\"}\"}\n",
	), 0o644); err != nil {
		t.Fatalf("write log: %v", err)
	}

	otherSessionID := "a7e7140c-669f-46ab-a7df-f76d31508a53"
	extractor := NewExtractor(baseDir, 20, 5)
	workspaces := []api.EnrichedWorkspace{
		{
			Workspace: api.Workspace{ID: "ws-1", Branch: "main"},
			Summary: api.WorkspaceSummary{
				WorkspaceID:     "ws-1",
				LatestSessionID: &sessionID,
			},
			DisplayName: "Workspace 1",
		},
		{
			Workspace: api.Workspace{ID: "ws-2", Branch: "feature"},
			Summary: api.WorkspaceSummary{
				WorkspaceID:     "ws-2",
				LatestSessionID: &otherSessionID,
			},
			DisplayName: "Workspace 2",
		},
		{
			Workspace:   api.Workspace{ID: "ws-3", Branch: "none"},
			Summary:     api.WorkspaceSummary{WorkspaceID: "ws-3"},
			DisplayName: "Workspace 3",
		},
	}

	snapshots := CollectSnapshots(extractor, workspaces)
	if got, want := len(snapshots), 1; got != want {
		t.Fatalf("snapshot len = %d, want %d", got, want)
	}
	if snapshots[0].SessionID != sessionID {
		t.Fatalf("session id = %s, want %s", snapshots[0].SessionID, sessionID)
	}
}
