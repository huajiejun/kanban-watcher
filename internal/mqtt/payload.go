package mqtt

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

// MQTT topic constants for Home Assistant MQTT Discovery.
const (
	TopicDiscovery   = "homeassistant/sensor/kanban_watcher/summary/config"
	TopicState       = "homeassistant/sensor/kanban_watcher/summary/state"
	TopicAttributes  = "homeassistant/sensor/kanban_watcher/summary/attributes"
)

// haDiscoveryPayload is the HA MQTT Discovery configuration message.
type haDiscoveryPayload struct {
	Name                string   `json:"name"`
	UniqueID            string   `json:"unique_id"`
	StateTopic          string   `json:"state_topic"`
	JSONAttributesTopic string   `json:"json_attributes_topic"`
	UnitOfMeasurement   string   `json:"unit_of_measurement"`
	Icon                string   `json:"icon"`
	Device              haDevice `json:"device"`
}

type haDevice struct {
	Identifiers  []string `json:"identifiers"`
	Name         string   `json:"name"`
	Manufacturer string   `json:"manufacturer"`
}

// WorkspaceItem is the per-workspace entry in the attributes payload.
type WorkspaceItem struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	Status             string `json:"status"`
	HasUnseenTurns     bool   `json:"has_unseen_turns"`
	HasPendingApproval bool   `json:"has_pending_approval"`
	FilesChanged       *int   `json:"files_changed,omitempty"`
	LinesAdded         *int   `json:"lines_added,omitempty"`
	LinesRemoved       *int   `json:"lines_removed,omitempty"`
	CompletedAt        string `json:"completed_at,omitempty"`
	PrStatus           string `json:"pr_status,omitempty"`
	PrURL              string `json:"pr_url,omitempty"`
	NeedsAttention     bool   `json:"needs_attention"`
}

// AttributesPayload is the full JSON pushed to the attributes topic.
type AttributesPayload struct {
	Count          int             `json:"count"`
	AttentionCount int             `json:"attention_count"`
	UpdatedAt      string          `json:"updated_at"`
	Workspaces     []WorkspaceItem `json:"workspaces"`
}

// BuildDiscoveryJSON returns the retained HA MQTT Discovery payload.
func BuildDiscoveryJSON() ([]byte, error) {
	payload := haDiscoveryPayload{
		Name:                "Kanban Watcher",
		UniqueID:            "kanban_watcher_summary",
		StateTopic:          TopicState,
		JSONAttributesTopic: TopicAttributes,
		UnitOfMeasurement:   "workspaces",
		Icon:                "mdi:layers-outline",
		Device: haDevice{
			Identifiers:  []string{"kanban_watcher"},
			Name:         "Kanban Watcher",
			Manufacturer: "vibe-kanban",
		},
	}
	return json.Marshal(payload)
}

// BuildStateValue returns the plain string state value (total workspace count).
func BuildStateValue(workspaces []api.EnrichedWorkspace) string {
	return fmt.Sprintf("%d", len(workspaces))
}

// BuildAttributesJSON returns the JSON attributes payload.
func BuildAttributesJSON(workspaces []api.EnrichedWorkspace) ([]byte, error) {
	attentionCount := 0
	items := make([]WorkspaceItem, 0, len(workspaces))

	for _, w := range workspaces {
		if w.NeedsAttention() {
			attentionCount++
		}
		completedAt := ""
		if w.Summary.LatestProcessCompletedAt != nil {
			completedAt = *w.Summary.LatestProcessCompletedAt
		}
		prStatus := ""
		if w.Summary.PrStatus != nil {
			prStatus = *w.Summary.PrStatus
		}
		prURL := ""
		if w.Summary.PrURL != nil {
			prURL = *w.Summary.PrURL
		}
		items = append(items, WorkspaceItem{
			ID:                 w.ID,
			Name:               w.DisplayName,
			Status:             w.StatusText(),
			HasUnseenTurns:     w.Summary.HasUnseenTurns,
			HasPendingApproval: w.Summary.HasPendingApproval,
			FilesChanged:       w.Summary.FilesChanged,
			LinesAdded:         w.Summary.LinesAdded,
			LinesRemoved:       w.Summary.LinesRemoved,
			CompletedAt:        completedAt,
			PrStatus:           prStatus,
			PrURL:              prURL,
			NeedsAttention:     w.NeedsAttention(),
		})
	}

	attrs := AttributesPayload{
		Count:          len(workspaces),
		AttentionCount: attentionCount,
		UpdatedAt:      time.Now().UTC().Format(time.RFC3339),
		Workspaces:     items,
	}
	return json.Marshal(attrs)
}
