package api

import (
	"regexp"
	"strings"
)

var (
	fencedCodeBlockPattern = regexp.MustCompile("(?s)```.*?```")
	markdownLinkPattern    = regexp.MustCompile(`\[(.*?)\]\((.*?)\)`)
	linePrefixPattern      = regexp.MustCompile(`(?m)^\s{0,3}(?:#{1,6}|\d+\.|[-*+])\s*`)
	markdownNoisePattern   = regexp.MustCompile("[*_`~>#]+")
	whitespacePattern      = regexp.MustCompile(`\s+`)
)

func buildReasonHint(summary WorkspaceSummary) string {
	switch {
	case summary.HasPendingApproval:
		return "待审批：等待你确认下一步"
	case summary.LatestProcessStatus != nil && *summary.LatestProcessStatus == "failed":
		return "运行失败：请检查最新日志"
	case summary.HasUnseenTurns:
		return "未读消息：请查看最新回复"
	default:
		return ""
	}
}

func cleanMenuSummary(text string) string {
	if text == "" {
		return ""
	}

	text = fencedCodeBlockPattern.ReplaceAllString(text, " ")
	text = markdownLinkPattern.ReplaceAllString(text, "$1")
	text = linePrefixPattern.ReplaceAllString(text, "")
	text = markdownNoisePattern.ReplaceAllString(text, " ")
	text = whitespacePattern.ReplaceAllString(text, " ")

	return strings.TrimSpace(text)
}

func buildMenuSummary(ws Workspace, summary WorkspaceSummary) (string, string) {
	if reason := buildReasonHint(summary); reason != "" {
		return reason, "reason"
	}

	if ws.LastMessage != nil {
		if cleaned := cleanMenuSummary(*ws.LastMessage); cleaned != "" {
			return cleaned, "last_message"
		}
	}

	return "", "empty"
}
