package diff

import (
	"testing"
	"time"
)

func TestNewClient(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
	}{
		{
			name:    "http URL",
			baseURL: "http://127.0.0.1:7777",
		},
		{
			name:    "https URL",
			baseURL: "https://example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := NewClient(tt.baseURL)
			if client == nil {
				t.Fatal("client should not be nil")
			}
			if client.baseURL != tt.baseURL {
				t.Errorf("baseURL = %q, want %q", client.baseURL, tt.baseURL)
			}
		})
	}
}

func TestNewClientWithOptions(t *testing.T) {
	diffCalled := false
	errorCalled := false
	readyCalled := false

	client := NewClient("http://127.0.0.1:7777",
		WithOnDiff(func(workspaceID string, diff *WorkspaceDiff) {
			diffCalled = true
		}),
		WithOnError(func(workspaceID string, err error) {
			errorCalled = true
		}),
		WithOnReady(func(workspaceID string) {
			readyCalled = true
		}),
	)

	if client.onDiff == nil {
		t.Error("onDiff callback should be set")
	}
	if client.onError == nil {
		t.Error("onError callback should be set")
	}
	if client.onReady == nil {
		t.Error("onReady callback should be set")
	}

	// 测试回调可以被调用
	client.onDiff("test", &WorkspaceDiff{})
	if !diffCalled {
		t.Error("onDiff should have been called")
	}
	client.onError("test", nil)
	if !errorCalled {
		t.Error("onError should have been called")
	}
	client.onReady("test")
	if !readyCalled {
		t.Error("onReady should have been called")
	}
}

func TestCalculateStats(t *testing.T) {
	tests := []struct {
		name          string
		diffs         map[string]Diff
		wantFiles     int
		wantAdded     int
		wantRemoved   int
	}{
		{
			name:          "empty diffs",
			diffs:         map[string]Diff{},
			wantFiles:     0,
			wantAdded:     0,
			wantRemoved:   0,
		},
		{
			name: "single file with stats",
			diffs: map[string]Diff{
				"file1.go": {
					Change:    DiffModified,
					Additions: intPtr(10),
					Deletions: intPtr(5),
				},
			},
			wantFiles:   1,
			wantAdded:   10,
			wantRemoved: 5,
		},
		{
			name: "multiple files",
			diffs: map[string]Diff{
				"file1.go": {
					Change:    DiffModified,
					Additions: intPtr(10),
					Deletions: intPtr(5),
				},
				"file2.go": {
					Change:    DiffAdded,
					Additions: intPtr(20),
					Deletions: intPtr(0),
				},
				"file3.go": {
					Change:    DiffDeleted,
					Additions: intPtr(0),
					Deletions: intPtr(15),
				},
			},
			wantFiles:   3,
			wantAdded:   30,
			wantRemoved: 20,
		},
		{
			name: "file without stats",
			diffs: map[string]Diff{
				"file1.go": {
					Change: DiffModified,
					// NoAdditions or Deletions
				},
			},
			wantFiles:   1,
			wantAdded:   0,
			wantRemoved: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stats := calculateStats(tt.diffs)
			if stats.FilesChanged != tt.wantFiles {
				t.Errorf("FilesChanged = %d, want %d", stats.FilesChanged, tt.wantFiles)
			}
			if stats.LinesAdded != tt.wantAdded {
				t.Errorf("LinesAdded = %d, want %d", stats.LinesAdded, tt.wantAdded)
			}
			if stats.LinesRemoved != tt.wantRemoved {
				t.Errorf("LinesRemoved = %d, want %d", stats.LinesRemoved, tt.wantRemoved)
			}
		})
	}
}

func TestClient_GetDiff(t *testing.T) {
	client := NewClient("http://127.0.0.1:7777")

	// 测试不存在的工作区
	diff := client.GetDiff("non-existent")
	if diff != nil {
		t.Error("GetDiff for non-existent workspace should return nil")
	}
}

func TestClient_GetSubscribed(t *testing.T) {
	client := NewClient("http://127.0.0.1:7777")

	// 初始应该为空
	subs := client.GetSubscribed()
	if len(subs) != 0 {
		t.Errorf("GetSubscribed() = %v, want empty", subs)
	}
}

func TestClient_Close(t *testing.T) {
	client := NewClient("http://127.0.0.1:7777")

	// Close 应该不会 panic
	client.Close()

	// 多次 Close 也应该安全
	client.Close()
}

func TestProcessMessage(t *testing.T) {
	tests := []struct {
		name           string
		initialDiffs   map[string]Diff
		msg            *LogMessage
		expectedCount  int
		expectedChange DiffKind
	}{
		{
			name: "ready message",
			initialDiffs: map[string]Diff{},
			msg: &LogMessage{
				Ready: true,
			},
			expectedCount: 0,
		},
		{
			name: "add diff",
			initialDiffs: map[string]Diff{},
			msg: &LogMessage{
				Type: "json_patch",
				Patch: &PatchOperation{
					Op:   "add",
					Path: "/diffs/test.go",
					Value: &Diff{
						Change:    DiffAdded,
						Additions: intPtr(10),
					},
				},
			},
			expectedCount:  1,
			expectedChange: DiffAdded,
		},
		{
			name: "remove diff",
			initialDiffs: map[string]Diff{
				"test.go": {Change: DiffAdded},
			},
			msg: &LogMessage{
				Type: "json_patch",
				Patch: &PatchOperation{
					Op:   "remove",
					Path: "/diffs/test.go",
				},
			},
			expectedCount: 0,
		},
		{
			name: "ignore non-diffs path",
			initialDiffs: map[string]Diff{},
			msg: &LogMessage{
				Type: "json_patch",
				Patch: &PatchOperation{
					Op:   "add",
					Path: "/other/test.go",
					Value: &Diff{
						Change: DiffAdded,
					},
				},
			},
			expectedCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			readyCalled := false
			client := NewClient("http://127.0.0.1:7777",
				WithOnReady(func(workspaceID string) {
					readyCalled = true
				}),
			)

			stream := &Stream{
				WorkspaceID: "test",
				diff: &WorkspaceDiff{
					WorkspaceID: "test",
					Diffs:       tt.initialDiffs,
				},
			}

			client.processMessage(stream, tt.msg)

			if tt.msg.Ready && !readyCalled {
				t.Error("onReady should have been called")
			}

			if len(stream.diff.Diffs) != tt.expectedCount {
				t.Errorf("diffs count = %d, want %d", len(stream.diff.Diffs), tt.expectedCount)
			}

			if tt.expectedChange != "" && tt.msg.Patch != nil && tt.msg.Patch.Value != nil {
				if d, ok := stream.diff.Diffs["test.go"]; ok {
					if d.Change != tt.expectedChange {
						t.Errorf("change = %q, want %q", d.Change, tt.expectedChange)
					}
				}
			}
		})
	}
}

func TestWorkspaceDiff_Stats(t *testing.T) {
	diff := &WorkspaceDiff{
		WorkspaceID: "test",
		Diffs: map[string]Diff{
			"file1.go": {
				Change:    DiffModified,
				Additions: intPtr(10),
				Deletions: intPtr(5),
			},
			"file2.go": {
				Change:    DiffAdded,
				Additions: intPtr(20),
			},
		},
		UpdatedAt: time.Now(),
	}

	diff.Stats = calculateStats(diff.Diffs)

	if diff.Stats.FilesChanged != 2 {
		t.Errorf("FilesChanged = %d, want 2", diff.Stats.FilesChanged)
	}
	if diff.Stats.LinesAdded != 30 {
		t.Errorf("LinesAdded = %d, want 30", diff.Stats.LinesAdded)
	}
	if diff.Stats.LinesRemoved != 5 {
		t.Errorf("LinesRemoved = %d, want 5", diff.Stats.LinesRemoved)
	}
}

// intPtr 返回 int 的指针
func intPtr(v int) *int {
	return &v
}
