package tray

import (
	"strings"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

func TestFormatWorkspaceMenuShowsSummaryLine(t *testing.T) {
	view := formatWorkspaceMenu(api.EnrichedWorkspace{
		DisplayName: "任务 A",
		MenuSummary: "待审批：等待你确认下一步",
		Summary: api.WorkspaceSummary{
			HasPendingApproval: true,
		},
	})

	if !view.ShowSummary {
		t.Fatal("ShowSummary = false, want true")
	}
	if view.Title != "⏳ 任务 A" {
		t.Fatalf("title = %q", view.Title)
	}
	if view.Summary != "    待审批：等待你确认下一步" {
		t.Fatalf("summary = %q", view.Summary)
	}
}

func TestFormatWorkspaceMenuTruncatesSummary(t *testing.T) {
	view := formatWorkspaceMenu(api.EnrichedWorkspace{
		DisplayName: "任务 A",
		MenuSummary: strings.Repeat("长", maxMenuSummaryRunes+5),
	})

	if !strings.HasSuffix(strings.TrimSpace(view.Summary), "…") {
		t.Fatalf("summary = %q, want ellipsis suffix", view.Summary)
	}
}

func TestFormatWorkspaceMenuOmitsEmptySummary(t *testing.T) {
	view := formatWorkspaceMenu(api.EnrichedWorkspace{
		DisplayName: "任务 A",
	})

	if view.ShowSummary {
		t.Fatal("ShowSummary = true, want false")
	}
}
