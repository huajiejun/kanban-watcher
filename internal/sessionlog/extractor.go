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
	logFiles, err := e.logFiles(target.SessionID)
	if err != nil {
		return SessionConversationSnapshot{}, err
	}

	messages := make([]ConversationMessage, 0)
	toolCalls := make([]ToolCallSummary, 0)
	updatedAt := time.Time{}
	for _, logFile := range logFiles {
		fileMessages, fileToolCalls, err := parseLogFile(logFile.path, logFile.mod.UTC())
		if err != nil {
			return SessionConversationSnapshot{}, err
		}
		messages = append(messages, fileMessages...)
		toolCalls = append(toolCalls, fileToolCalls...)
		updatedAt = logFile.mod.UTC()
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

type logFile struct {
	path string
	mod  time.Time
}

func (e *Extractor) logFiles(sessionID string) ([]logFile, error) {
	if len(sessionID) < 2 {
		return nil, fmt.Errorf("invalid session_id: %q", sessionID)
	}
	processDir := filepath.Join(e.baseDir, "sessions", strings.ToLower(sessionID[:2]), sessionID, "processes")
	entries, err := os.ReadDir(processDir)
	if err != nil {
		return nil, fmt.Errorf("read process dir: %w", err)
	}

	var candidates []logFile
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".jsonl" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, fmt.Errorf("stat log file %s: %w", entry.Name(), err)
		}
		candidates = append(candidates, logFile{
			path: filepath.Join(processDir, entry.Name()),
			mod:  info.ModTime(),
		})
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("no process log found for session %s", sessionID)
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].mod.Equal(candidates[j].mod) {
			return candidates[i].path < candidates[j].path
		}
		return candidates[i].mod.Before(candidates[j].mod)
	})
	return candidates, nil
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

type codexEvent struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type codexParams struct {
	Item   json.RawMessage `json:"item"`
	ItemID string          `json:"itemId"`
	Delta  string          `json:"delta"`
	Msg    *codexMsg       `json:"msg"`
}

type codexMsg struct {
	Item   json.RawMessage `json:"item"`
	ItemID string          `json:"item_id"`
	Delta  string          `json:"delta"`
}

type codexCompletedItem struct {
	Type    string      `json:"type"`
	ID      string      `json:"id"`
	Text    string      `json:"text"`
	Content interface{} `json:"content"`
}

type deltaMessage struct {
	order int
	text  string
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
	deltaMessages := make(map[string]deltaMessage)
	completedItems := make(map[string]struct{})
	nextDeltaOrder := 0

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
		if err := json.Unmarshal([]byte(envelope.Stdout), &record); err == nil && record.Type != "" {
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
			continue
		}

		codexMessage, itemID, deltaText := parseCodexEvent([]byte(envelope.Stdout), timestamp)
		if deltaText != "" && itemID != "" {
			existing := deltaMessages[itemID]
			if existing.order == 0 && existing.text == "" {
				nextDeltaOrder++
				existing.order = nextDeltaOrder
			}
			existing.text = mergeDeltaText(existing.text, deltaText)
			deltaMessages[itemID] = existing
		}
		if codexMessage.Content != "" {
			if itemID != "" {
				if _, exists := completedItems[itemID]; exists {
					delete(deltaMessages, itemID)
					continue
				}
				completedItems[itemID] = struct{}{}
				delete(deltaMessages, itemID)
			}
			messages = append(messages, codexMessage)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, nil, fmt.Errorf("scan log file: %w", err)
	}

	return messages, toolCalls, nil
}

func parseCodexEvent(raw []byte, timestamp time.Time) (ConversationMessage, string, string) {
	var event codexEvent
	if err := json.Unmarshal(raw, &event); err != nil || event.Method == "" {
		return ConversationMessage{}, "", ""
	}

	var params codexParams
	if err := json.Unmarshal(event.Params, &params); err != nil {
		return ConversationMessage{}, "", ""
	}

	switch event.Method {
	case "item/completed", "codex/event/item_completed":
		itemRaw := params.Item
		if len(itemRaw) == 0 && params.Msg != nil {
			itemRaw = params.Msg.Item
		}
		if len(itemRaw) == 0 {
			return ConversationMessage{}, "", ""
		}
		var item codexCompletedItem
		if err := json.Unmarshal(itemRaw, &item); err != nil {
			return ConversationMessage{}, "", ""
		}
		role, text := parseCodexCompletedItem(item)
		if text == "" {
			return ConversationMessage{}, item.ID, ""
		}
		return ConversationMessage{
			Role:      role,
			Content:   text,
			Timestamp: timestamp,
		}, item.ID, ""
	case "codex/event/agent_message_delta", "codex/event/agent_message_content_delta", "item/agentMessage/delta":
		itemID := params.ItemID
		delta := params.Delta
		if params.Msg != nil {
			if itemID == "" {
				itemID = params.Msg.ItemID
			}
			if delta == "" {
				delta = params.Msg.Delta
			}
		}
		return ConversationMessage{}, itemID, delta
	default:
		return ConversationMessage{}, "", ""
	}
}

func parseCodexCompletedItem(item codexCompletedItem) (string, string) {
	itemType := strings.ToLower(item.Type)
	switch itemType {
	case "usermessage":
		return "user", firstNonEmpty(item.Text, extractCodexText(item.Content))
	case "agentmessage":
		return "assistant", firstNonEmpty(item.Text, extractCodexText(item.Content))
	default:
		return "", ""
	}
}

func extractCodexText(content interface{}) string {
	items := decodeContentItems(content)
	var texts []string
	for _, item := range items {
		if strings.EqualFold(item.Type, "text") && item.Text != "" {
			texts = append(texts, item.Text)
		}
	}
	return strings.Join(texts, "\n\n")
}

func appendPendingDeltas(messages *[]ConversationMessage, deltaMessages map[string]deltaMessage, timestamp time.Time) {
	if len(deltaMessages) == 0 {
		return
	}

	type orderedDelta struct {
		order int
		text  string
	}
	ordered := make([]orderedDelta, 0, len(deltaMessages))
	for _, msg := range deltaMessages {
		if msg.text == "" {
			continue
		}
		ordered = append(ordered, orderedDelta{order: msg.order, text: msg.text})
	}
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].order < ordered[j].order
	})
	for _, msg := range ordered {
		*messages = append(*messages, ConversationMessage{
			Role:      "assistant",
			Content:   msg.text,
			Timestamp: timestamp,
		})
	}
}

func mergeDeltaText(existing, delta string) string {
	if existing == "" {
		return delta
	}
	if delta == "" {
		return existing
	}
	if strings.HasPrefix(delta, existing) {
		return delta
	}
	if strings.HasPrefix(existing, delta) {
		return existing
	}
	return existing + delta
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
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
