package sessionlog

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

const (
	defaultRecentMessageLimit  = 20
	defaultRecentToolCallLimit = 5
	maxSummaryLength           = 500
)

type SessionTarget struct {
	SessionID     string
	WorkspaceID   string
	WorkspaceName string
}

type ConversationMessage struct {
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

type ToolCallSummary struct {
	Name          string    `json:"name"`
	ToolUseID     string    `json:"tool_use_id"`
	InputSummary  string    `json:"input_summary,omitempty"`
	ResultSummary string    `json:"result_summary,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

type SessionConversationSnapshot struct {
	SessionID       string                `json:"session_id"`
	WorkspaceID     string                `json:"workspace_id"`
	WorkspaceName   string                `json:"workspace_name"`
	LastMessage     string                `json:"last_message"`
	LastRole        string                `json:"last_role"`
	MessageCount    int                   `json:"message_count"`
	ToolCallCount   int                   `json:"tool_call_count"`
	UpdatedAt       time.Time             `json:"updated_at"`
	RecentMessages  []ConversationMessage `json:"recent_messages"`
	RecentToolCalls []ToolCallSummary     `json:"recent_tool_calls"`
}

type Extractor struct {
	baseDir             string
	recentMessageLimit  int
	recentToolCallLimit int
}

func NewExtractor(baseDir string, recentMessageLimit, recentToolCallLimit int) *Extractor {
	if baseDir == "" {
		baseDir = defaultBaseDir()
	}
	if recentMessageLimit <= 0 {
		recentMessageLimit = defaultRecentMessageLimit
	}
	if recentToolCallLimit <= 0 {
		recentToolCallLimit = defaultRecentToolCallLimit
	}
	return &Extractor{
		baseDir:             baseDir,
		recentMessageLimit:  recentMessageLimit,
		recentToolCallLimit: recentToolCallLimit,
	}
}

func (e *Extractor) ExtractSnapshot(target SessionTarget) (SessionConversationSnapshot, error) {
	logPath, updatedAt, err := e.latestLogFile(target.SessionID)
	if err != nil {
		return SessionConversationSnapshot{}, err
	}

	messages, toolCalls, err := parseLogFile(logPath, updatedAt)
	if err != nil {
		return SessionConversationSnapshot{}, err
	}

	snapshot := SessionConversationSnapshot{
		SessionID:       target.SessionID,
		WorkspaceID:     target.WorkspaceID,
		WorkspaceName:   target.WorkspaceName,
		MessageCount:    len(messages),
		ToolCallCount:   len(toolCalls),
		UpdatedAt:       updatedAt,
		RecentMessages:  tailMessages(messages, e.recentMessageLimit),
		RecentToolCalls: tailToolCalls(toolCalls, e.recentToolCallLimit),
	}
	if len(messages) > 0 {
		last := messages[len(messages)-1]
		snapshot.LastRole = last.Role
		snapshot.LastMessage = last.Content
	}
	return snapshot, nil
}

func (e *Extractor) latestLogFile(sessionID string) (string, time.Time, error) {
	if len(sessionID) < 2 {
		return "", time.Time{}, fmt.Errorf("invalid session_id: %q", sessionID)
	}
	processDir := filepath.Join(e.baseDir, "sessions", strings.ToLower(sessionID[:2]), sessionID, "processes")
	entries, err := os.ReadDir(processDir)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("read process dir: %w", err)
	}

	type candidate struct {
		path string
		mod  time.Time
	}
	var candidates []candidate
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".jsonl" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return "", time.Time{}, fmt.Errorf("stat log file %s: %w", entry.Name(), err)
		}
		candidates = append(candidates, candidate{
			path: filepath.Join(processDir, entry.Name()),
			mod:  info.ModTime(),
		})
	}
	if len(candidates) == 0 {
		return "", time.Time{}, fmt.Errorf("no process log found for session %s", sessionID)
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].mod.Equal(candidates[j].mod) {
			return candidates[i].path < candidates[j].path
		}
		return candidates[i].mod.Before(candidates[j].mod)
	})
	latest := candidates[len(candidates)-1]
	return latest.path, latest.mod.UTC(), nil
}

type logEnvelope struct {
	Stdout string `json:"Stdout"`
	Stderr string `json:"Stderr"`
}

type logRecord struct {
	Type      string          `json:"type"`
	Message   json.RawMessage `json:"message"`
	SessionID string          `json:"session_id"`
}

type messageEnvelope struct {
	Content interface{} `json:"content"`
}

type contentItem struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Input     json.RawMessage `json:"input"`
	ToolUseID string          `json:"tool_use_id"`
	Content   interface{}     `json:"content"`
}

func parseLogFile(path string, timestamp time.Time) ([]ConversationMessage, []ToolCallSummary, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open log file: %w", err)
	}
	defer file.Close()

	var messages []ConversationMessage
	var toolCalls []ToolCallSummary
	toolIndex := make(map[string]int)

	scanner := bufio.NewScanner(file)
	const maxCapacity = 1024 * 1024
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, maxCapacity)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var envelope logEnvelope
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			continue
		}
		if envelope.Stdout == "" {
			continue
		}

		var record logRecord
		if err := json.Unmarshal([]byte(envelope.Stdout), &record); err != nil {
			continue
		}

		switch record.Type {
		case "assistant":
			text, calls := parseAssistantMessage(record.Message, timestamp)
			if text != "" {
				messages = append(messages, ConversationMessage{Role: "assistant", Content: text, Timestamp: timestamp})
			}
			for _, call := range calls {
				toolIndex[call.ToolUseID] = len(toolCalls)
				toolCalls = append(toolCalls, call)
			}
		case "user":
			msg, result := parseUserMessage(record.Message, timestamp)
			if msg.Content != "" {
				messages = append(messages, msg)
			}
			if result.ToolUseID != "" {
				if idx, ok := toolIndex[result.ToolUseID]; ok {
					toolCalls[idx].ResultSummary = result.ResultSummary
				}
			}
		case "system", "control_request", "control_response":
			text := parseGenericMessage(record.Message)
			if text == "" {
				continue
			}
			messages = append(messages, ConversationMessage{Role: record.Type, Content: text, Timestamp: timestamp})
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, nil, fmt.Errorf("scan log file: %w", err)
	}
	return messages, toolCalls, nil
}

func parseAssistantMessage(raw json.RawMessage, timestamp time.Time) (string, []ToolCallSummary) {
	var envelope messageEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return "", nil
	}
	items := decodeContentItems(envelope.Content)
	var texts []string
	var calls []ToolCallSummary
	for _, item := range items {
		switch item.Type {
		case "text":
			if item.Text != "" {
				texts = append(texts, item.Text)
			}
		case "tool_use":
			calls = append(calls, ToolCallSummary{
				Name:         item.Name,
				ToolUseID:    item.ID,
				InputSummary: summarizeRawJSON(item.Input),
				Timestamp:    timestamp,
			})
		}
	}
	return strings.Join(texts, "\n\n"), calls
}

func parseUserMessage(raw json.RawMessage, timestamp time.Time) (ConversationMessage, ToolCallSummary) {
	var envelope messageEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return ConversationMessage{}, ToolCallSummary{}
	}
	switch content := envelope.Content.(type) {
	case string:
		return ConversationMessage{Role: "user", Content: content, Timestamp: timestamp}, ToolCallSummary{}
	case []interface{}:
		items := decodeContentItems(content)
		for _, item := range items {
			if item.Type == "tool_result" {
				return ConversationMessage{}, ToolCallSummary{
					ToolUseID:     item.ToolUseID,
					ResultSummary: summarizeAny(item.Content),
					Timestamp:     timestamp,
				}
			}
		}
	}
	return ConversationMessage{}, ToolCallSummary{}
}

func parseGenericMessage(raw json.RawMessage) string {
	var envelope messageEnvelope
	if err := json.Unmarshal(raw, &envelope); err == nil {
		text := summarizeAny(envelope.Content)
		if text != "" {
			return text
		}
	}
	return summarizeRawJSON(raw)
}

func decodeContentItems(content interface{}) []contentItem {
	switch typed := content.(type) {
	case []interface{}:
		items := make([]contentItem, 0, len(typed))
		for _, item := range typed {
			data, err := json.Marshal(item)
			if err != nil {
				continue
			}
			var decoded contentItem
			if err := json.Unmarshal(data, &decoded); err != nil {
				continue
			}
			items = append(items, decoded)
		}
		return items
	default:
		return nil
	}
}

func summarizeAny(v interface{}) string {
	switch typed := v.(type) {
	case string:
		return truncateSummary(strings.TrimSpace(typed))
	default:
		data, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return truncateSummary(string(data))
	}
}

func summarizeRawJSON(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	return truncateSummary(string(raw))
}

func truncateSummary(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxSummaryLength {
		return s
	}
	return s[:maxSummaryLength-3] + "..."
}

func tailMessages(messages []ConversationMessage, limit int) []ConversationMessage {
	if len(messages) <= limit {
		return append([]ConversationMessage(nil), messages...)
	}
	return append([]ConversationMessage(nil), messages[len(messages)-limit:]...)
}

func tailToolCalls(toolCalls []ToolCallSummary, limit int) []ToolCallSummary {
	if len(toolCalls) <= limit {
		return append([]ToolCallSummary(nil), toolCalls...)
	}
	return append([]ToolCallSummary(nil), toolCalls[len(toolCalls)-limit:]...)
}

func defaultBaseDir() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(homeDir, "Library", "Application Support", "ai.bloop.vibe-kanban")
	case "windows":
		return filepath.Join(homeDir, "AppData", "Roaming", "ai.bloop.vibe-kanban")
	default:
		return filepath.Join(homeDir, ".local", "share", "vibe-kanban")
	}
}

func CollectSnapshots(extractor *Extractor, workspaces []api.EnrichedWorkspace) []SessionConversationSnapshot {
	if extractor == nil {
		return nil
	}

	snapshots := make([]SessionConversationSnapshot, 0, len(workspaces))
	for _, workspace := range workspaces {
		if workspace.Summary.LatestSessionID == nil || *workspace.Summary.LatestSessionID == "" {
			continue
		}

		snapshot, err := extractor.ExtractSnapshot(SessionTarget{
			SessionID:     *workspace.Summary.LatestSessionID,
			WorkspaceID:   workspace.ID,
			WorkspaceName: workspace.DisplayName,
		})
		if err != nil {
			continue
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots
}
