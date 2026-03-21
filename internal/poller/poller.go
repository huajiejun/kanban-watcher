package poller

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

// PollResult 单次轮询的结果
// 包含工作区数据列表、获取时间戳，以及可能发生的错误
type PollResult struct {
	Workspaces []api.EnrichedWorkspace // 工作区列表
	FetchedAt  time.Time               // 数据获取时间
	Err        error                   // 错误信息（发生错误时）
}

// Run 启动轮询循环，阻塞直到 ctx 被取消
// 结果通过 channel 异步发送给调用者，channel 应带有缓冲以避免阻塞
func Run(ctx context.Context, cfg *config.Config, client *api.Client, results chan<- PollResult) {
	// 启动后立即执行第一次轮询，确保启动时能立即获取数据
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

// poll 执行单次数据获取，遵守工作时间设置
// 若当前不在工作时间内，静默跳过（不发送结果）
func poll(ctx context.Context, cfg *config.Config, client *api.Client, results chan<- PollResult) {
	now := time.Now()

	// 检查是否在工作时间内
	inHours, err := config.IsWorkingHours(cfg.WorkingHours, now)
	if err != nil {
		fmt.Fprintf(os.Stderr, "工作时间检查错误: %v\n", err)
		// 配置出错时保守处理：视为工作时间内，避免遗漏数据
		inHours = true
	}
	if !inHours {
		return // 非工作时间，静默跳过
	}

	workspaces, fetchErr := client.FetchAll(ctx)

	result := PollResult{
		Workspaces: workspaces,
		FetchedAt:  time.Now(),
		Err:        fetchErr,
	}

	// 非阻塞发送：若消费者（主循环）尚未处理上一轮结果，则丢弃本次
	// 这避免轮询器阻塞在慢速消费者上，保证轮询间隔的准确性
	select {
	case results <- result:
	default:
		// 消费者繁忙，丢弃本次结果
	}
}
