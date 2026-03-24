package tray

import (
	"fmt"
	"strings"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

const maxMenuSummaryRunes = 36

type workspaceMenuView struct {
	Title          string
	TitleTooltip   string
	Summary        string
	SummaryTooltip string
	ShowSummary    bool
}

func formatWorkspaceMenu(w api.EnrichedWorkspace) workspaceMenuView {
	summary := truncateMenuSummary(strings.TrimSpace(w.MenuSummary), maxMenuSummaryRunes)

	return workspaceMenuView{
		Title:          fmt.Sprintf("%s %s", statusEmoji(w), w.DisplayName),
		TitleTooltip:   fmt.Sprintf("状态: %s", w.StatusText()),
		Summary:        "    " + summary,
		SummaryTooltip: w.MenuSummary,
		ShowSummary:    summary != "",
	}
}

func truncateMenuSummary(text string, maxRunes int) string {
	if text == "" {
		return ""
	}

	runes := []rune(text)
	if len(runes) <= maxRunes {
		return text
	}
	if maxRunes <= 1 {
		return "…"
	}
	return string(runes[:maxRunes-1]) + "…"
}
