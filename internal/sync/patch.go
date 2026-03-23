package sync

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

type wsPatchEnvelope struct {
	JsonPatch []jsonPatchOperation `json:"JsonPatch"`
	Ready     *bool                `json:"Ready,omitempty"`
	Finished  interface{}          `json:"finished,omitempty"`
}

type jsonPatchOperation struct {
	Op    string          `json:"op"`
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value,omitempty"`
}

type entryPatch struct {
	EntryIndex int
	Entry      store.NormalizedEntry
}

type remoteWorkspace struct {
	ID        string  `json:"id"`
	Name      *string `json:"name"`
	Branch    string  `json:"branch"`
	Archived  bool    `json:"archived"`
	Pinned    bool    `json:"pinned"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
	IsRunning bool    `json:"is_running"`
	IsErrored bool    `json:"is_errored"`
}

type remoteExecutionProcess struct {
	ID           string  `json:"id"`
	SessionID    string  `json:"session_id"`
	RunReason    string  `json:"run_reason"`
	Status       string  `json:"status"`
	Dropped      bool    `json:"dropped"`
	CreatedAt    *string `json:"created_at"`
	CompletedAt  *string `json:"completed_at"`
	Executor     *string `json:"executor"`
	ExecutorAction struct {
		Typ struct {
			Type string `json:"type"`
		} `json:"typ"`
	} `json:"executor_action"`
}

func extractEntryPatches(message []byte) ([]entryPatch, error) {
	var envelope wsPatchEnvelope
	if err := json.Unmarshal(message, &envelope); err != nil {
		return nil, fmt.Errorf("解析 ws patch: %w", err)
	}

	var patches []entryPatch
	for _, op := range envelope.JsonPatch {
		switch {
		case op.Path == "/entries":
			var entries []struct {
				Type    string                `json:"type"`
				Content store.NormalizedEntry `json:"content"`
			}
			if err := json.Unmarshal(op.Value, &entries); err != nil {
				return nil, fmt.Errorf("解析 entries 快照: %w", err)
			}
			for idx, item := range entries {
				if item.Type != "NORMALIZED_ENTRY" {
					continue
				}
				patches = append(patches, entryPatch{
					EntryIndex: idx,
					Entry:      item.Content,
				})
			}
		case strings.HasPrefix(op.Path, "/entries/"):
			idx, err := strconv.Atoi(strings.TrimPrefix(op.Path, "/entries/"))
			if err != nil {
				continue
			}
			var item struct {
				Type    string                `json:"type"`
				Content store.NormalizedEntry `json:"content"`
			}
			if err := json.Unmarshal(op.Value, &item); err != nil {
				return nil, fmt.Errorf("解析 entry patch: %w", err)
			}
			if item.Type != "NORMALIZED_ENTRY" {
				continue
			}
			patches = append(patches, entryPatch{
				EntryIndex: idx,
				Entry:      item.Content,
			})
		}
	}
	return patches, nil
}

func extractExecutionProcesses(message []byte) ([]remoteExecutionProcess, error) {
	var envelope wsPatchEnvelope
	if err := json.Unmarshal(message, &envelope); err != nil {
		return nil, fmt.Errorf("解析 ws patch: %w", err)
	}

	var result []remoteExecutionProcess
	for _, op := range envelope.JsonPatch {
		switch {
		case op.Path == "/execution_processes":
			var byID map[string]remoteExecutionProcess
			if err := json.Unmarshal(op.Value, &byID); err != nil {
				return nil, fmt.Errorf("解析 execution_processes 快照: %w", err)
			}
			for _, process := range byID {
				result = append(result, process)
			}
		case strings.HasPrefix(op.Path, "/execution_processes/"):
			if op.Op == "remove" {
				continue
			}
			var process remoteExecutionProcess
			if err := json.Unmarshal(op.Value, &process); err != nil {
				return nil, fmt.Errorf("解析 execution process patch: %w", err)
			}
			result = append(result, process)
		}
	}
	return result, nil
}

func extractWorkspacePatches(message []byte) ([]remoteWorkspace, error) {
	var envelope wsPatchEnvelope
	if err := json.Unmarshal(message, &envelope); err != nil {
		return nil, fmt.Errorf("解析 ws patch: %w", err)
	}

	var result []remoteWorkspace
	for _, op := range envelope.JsonPatch {
		switch {
		case op.Path == "/workspaces":
			var byID map[string]remoteWorkspace
			if err := json.Unmarshal(op.Value, &byID); err != nil {
				return nil, fmt.Errorf("解析 workspaces 快照: %w", err)
			}
			for _, workspace := range byID {
				result = append(result, workspace)
			}
		case strings.HasPrefix(op.Path, "/workspaces/"):
			if op.Op == "remove" {
				continue
			}
			var workspace remoteWorkspace
			if err := json.Unmarshal(op.Value, &workspace); err != nil {
				return nil, fmt.Errorf("解析 workspace patch: %w", err)
			}
			result = append(result, workspace)
		}
	}
	return result, nil
}
