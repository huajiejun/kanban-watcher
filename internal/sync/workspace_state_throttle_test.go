package sync

import (
	"testing"
	"time"
)

func TestShouldRefreshWorkspaceState(t *testing.T) {
	now := time.Date(2026, 3, 28, 10, 0, 0, 0, time.UTC)
	throttle := 500 * time.Millisecond

	tests := []struct {
		name          string
		lastRefreshed *time.Time
		processStatus string
		want          bool
	}{
		{
			name:          "refreshes when never refreshed",
			lastRefreshed: nil,
			processStatus: "running",
			want:          true,
		},
		{
			name:          "throttles repeated running updates inside window",
			lastRefreshed: timePtr(now.Add(-100 * time.Millisecond)),
			processStatus: "running",
			want:          false,
		},
		{
			name:          "allows running update after throttle window",
			lastRefreshed: timePtr(now.Add(-700 * time.Millisecond)),
			processStatus: "running",
			want:          true,
		},
		{
			name:          "always refreshes terminal state",
			lastRefreshed: timePtr(now.Add(-100 * time.Millisecond)),
			processStatus: "completed",
			want:          true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldRefreshWorkspaceState(tt.lastRefreshed, now, throttle, tt.processStatus); got != tt.want {
				t.Fatalf("shouldRefreshWorkspaceState(...) = %v, want %v", got, tt.want)
			}
		})
	}
}

func timePtr(value time.Time) *time.Time {
	return &value
}
