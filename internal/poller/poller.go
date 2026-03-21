package poller

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

// PollResult carries the outcome of one polling cycle.
type PollResult struct {
	Workspaces []api.EnrichedWorkspace
	FetchedAt  time.Time
	Err        error
}

// Run starts the polling loop and sends results on the results channel.
// It blocks until ctx is cancelled. The channel should be buffered to avoid
// dropping results if the consumer is momentarily busy.
func Run(ctx context.Context, cfg *config.Config, client *api.Client, results chan<- PollResult) {
	// Poll immediately on start
	poll(ctx, cfg, client, results)

	ticker := time.NewTicker(time.Duration(cfg.PollIntervalSecs) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			poll(ctx, cfg, client, results)
		}
	}
}

// poll performs a single fetch cycle, respecting working hours.
// If outside working hours, the poll is silently skipped.
func poll(ctx context.Context, cfg *config.Config, client *api.Client, results chan<- PollResult) {
	now := time.Now()

	inHours, err := config.IsWorkingHours(cfg.WorkingHours, now)
	if err != nil {
		fmt.Fprintf(os.Stderr, "working hours check error: %v\n", err)
		// Treat as in-hours to avoid missing data due to config error
		inHours = true
	}
	if !inHours {
		return
	}

	workspaces, fetchErr := client.FetchAll(ctx)

	result := PollResult{
		Workspaces: workspaces,
		FetchedAt:  time.Now(),
		Err:        fetchErr,
	}

	// Non-blocking send: skip if consumer hasn't read the previous result yet
	select {
	case results <- result:
	default:
		// Consumer is busy; discard this result to avoid blocking the poller
	}
}
