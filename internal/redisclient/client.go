package redisclient

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

// Client Redis 客户端封装
type Client struct {
	rdb *redis.Client
}

// NewClient 创建 Redis 客户端
func NewClient(cfg config.RedisConfig) (*Client, error) {
	poolSize := cfg.PoolSize
	if poolSize <= 0 {
		poolSize = 10
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
		PoolSize: poolSize,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		rdb.Close()
		return nil, fmt.Errorf("redis 连接失败: %w", err)
	}

	return &Client{rdb: rdb}, nil
}

// RDB 返回底层 redis.Client
func (c *Client) RDB() *redis.Client {
	return c.rdb
}

// Close 关闭连接
func (c *Client) Close() error {
	return c.rdb.Close()
}

// Ping 检查连接状态
func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}
