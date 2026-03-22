package mqtt

import (
	"encoding/json"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

func TestBuildAttributesJSONIncludesLatestSessionID(t *testing.T) {
	sessionID := "4f495318-07a4-4882-b4c1-4453ea9e2818"
	status := "running"
	workspaces := []api.EnrichedWorkspace{
		{
			Workspace: api.Workspace{
				ID:     "ea34b79d-f77e-4302-a1df-937c01067d34",
				Branch: "feature/modal-ui",
			},
			Summary: api.WorkspaceSummary{
				WorkspaceID:     "ea34b79d-f77e-4302-a1df-937c01067d34",
				LatestSessionID: &sessionID,
				LatestProcessStatus: &status,
			},
			DisplayName: "设计点击弹框界面",
		},
	}

	attrsJSON, err := BuildAttributesJSON(workspaces)
	if err != nil {
		t.Fatalf("BuildAttributesJSON returned error: %v", err)
	}

	var payload struct {
		Workspaces []struct {
			ID              string `json:"id"`
			LatestSessionID string `json:"latest_session_id"`
		} `json:"workspaces"`
	}
	if err := json.Unmarshal(attrsJSON, &payload); err != nil {
		t.Fatalf("json.Unmarshal returned error: %v", err)
	}

	if len(payload.Workspaces) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(payload.Workspaces))
	}
	if payload.Workspaces[0].ID != "ea34b79d-f77e-4302-a1df-937c01067d34" {
		t.Fatalf("unexpected workspace id: %s", payload.Workspaces[0].ID)
	}
	if payload.Workspaces[0].LatestSessionID != sessionID {
		t.Fatalf("expected latest_session_id %q, got %q", sessionID, payload.Workspaces[0].LatestSessionID)
	}
}
