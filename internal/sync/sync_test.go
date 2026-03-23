package sync

import (
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/config"
)

func TestWorkspaceRefreshInterval(t *testing.T) {
	tests := []struct {
		name     string
		interval int
		want     time.Duration
	}{
		{
			name:     "uses fast fallback when config is empty",
			interval: 0,
			want:     15 * time.Second,
		},
		{
			name:     "caps slow config to fast fallback",
			interval: 30,
			want:     15 * time.Second,
		},
		{
			name:     "keeps faster config",
			interval: 3,
			want:     3 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &SyncService{
				cfg: &config.Config{
					Database: config.DatabaseConfig{
						SyncIntervalSecs: tt.interval,
					},
				},
			}
			if got := service.workspaceRefreshInterval(); got != tt.want {
				t.Fatalf("workspaceRefreshInterval() = %s, want %s", got, tt.want)
			}
		})
	}
}
