package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"gopkg.in/yaml.v3"
)

// Config kanban-watcher 的根配置结构
type Config struct {
	KanbanAPIURL     string                 `yaml:"kanban_api_url"`        // vibe-kanban API 地址
	ConversationSync ConversationSyncConfig `yaml:"conversation_sync"`     // 会话日志同步配置
	WeChat           WeChatConfig           `yaml:"wechat"`                // 企业微信通知配置
	Notify           NotifyConfig           `yaml:"notify"`                // 弹框通知配置
	WorkingHours     WorkingHours           `yaml:"working_hours"`         // 工作时间窗口
	PollIntervalSecs int                    `yaml:"poll_interval_seconds"` // 轮询间隔（秒）
	Database         DatabaseConfig         `yaml:"database"`              // 数据库配置
	HTTPAPI          HTTPAPIConfig          `yaml:"http_api"`              // 本地 HTTP API 配置
	TokenStats       TokenStatsConfig       `yaml:"token_stats"`           // Token 用量统计配置
	Auth             AuthConfig             `yaml:"auth"`                  // JWT 认证配置
}

// AuthConfig JWT 认证配置
type AuthConfig struct {
	Enabled         *bool        `yaml:"enabled"`           // 是否启用认证，默认 true
	JWTSecret       string       `yaml:"jwt_secret"`        // JWT 签名密钥，为空则自动生成
	TokenExpireDays int          `yaml:"token_expire_days"` // Token 有效期（天）
	Users           []UserConfig `yaml:"users"`             // 用户列表
}

// IsEnabled 检查认证是否启用
func (c AuthConfig) IsEnabled() bool {
	return c.Enabled == nil || *c.Enabled
}

// UserConfig 用户配置
type UserConfig struct {
	Username     string `yaml:"username"`      // 用户名
	PasswordHash string `yaml:"password_hash"` // bcrypt 密码哈希
}

// DatabaseConfig 数据库连接参数
type DatabaseConfig struct {
	Host             string   `yaml:"host"`                // 数据库主机地址
	Port             int      `yaml:"port"`                // 数据库端口
	User             string   `yaml:"user"`                // 用户名
	Password         string   `yaml:"password"`            // 密码
	Database         string   `yaml:"database"`            // 数据库名
	SyncIntervalSecs int      `yaml:"sync_interval_seconds"` // 同步间隔（秒）
	BatchSize        int      `yaml:"batch_size"`           // 批量大小
	MessageTypes     []string `yaml:"message_types"`       // 同步的消息类型
}

// HTTPAPIConfig 本地 HTTP API 配置
type HTTPAPIConfig struct {
	Port               int    `yaml:"port"`
	APIKey             string `yaml:"api_key"`
	BrowserURLTemplate string `yaml:"browser_url_template"`
}

// IsEnabled 检查数据库配置是否启用
func (c DatabaseConfig) IsEnabled() bool {
	return c.Host != "" && c.Database != "" && c.User != ""
}

// DSN 生成数据库连接字符串
func (c DatabaseConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		c.User, c.Password, c.Host, c.Port, c.Database)
}

// TokenStatsConfig Token 用量统计配置
type TokenStatsConfig struct {
	Enabled           *bool `yaml:"enabled"`             // 是否启用
	SyncIntervalHours int   `yaml:"sync_interval_hours"` // 同步间隔（小时），默认 1
}

// IsEnabled 检查 token 统计是否启用
func (c TokenStatsConfig) IsEnabled() bool {
	return c.Enabled == nil || *c.Enabled
}

// ConversationSyncConfig 对话日志提取与 Home Assistant 同步配置
type ConversationSyncConfig struct {
	Enabled             *bool  `yaml:"enabled"`                // 是否启用会话同步
	BaseDir             string `yaml:"base_dir"`               // Vibe Kanban 日志根目录
	RecentMessageLimit  int    `yaml:"recent_message_limit"`   // 最近主消息条数
	RecentToolCallLimit int    `yaml:"recent_tool_call_limit"` // 最近工具调用条数
	SessionPreservedDays int   `yaml:"session_preserved_days"` // 保留最近 N 天的 session（过期会被清理）
	SessionCleanupHours int    `yaml:"session_cleanup_hours"`  // 清理间隔（小时），默认 1
}

// WeChatConfig 企业微信配置（支持应用API + Webhook降级）
type WeChatConfig struct {
	// 应用方式配置
	CorpID   string `yaml:"corp_id"`   // 企业 ID
	AgentID  string `yaml:"agent_id"`  // 应用 AgentID
	Secret   string `yaml:"secret"`    // 应用 Secret
	ToUser   string `yaml:"to_user"`   // 接收消息的成员账号（@all 表示全部成员）
	ProxyURL string `yaml:"proxy_url"` // API 代理地址（不填则直连）

	// Webhook 降级配置（应用失败时使用）
	WebhookURL string `yaml:"webhook_url"` // Webhook 地址（不填则不使用降级）

	NotifyThresholdMinutes int `yaml:"notify_threshold_minutes"` // 通知阈值（分钟）
}

// NotifyConfig 弹框通知配置
type NotifyConfig struct {
	// 分级超时阈值（分钟）
	ApprovalThreshold int `yaml:"approval_threshold"` // 待审批超时：默认 15
	MessageThreshold int `yaml:"message_threshold"`  // 未读消息超时：默认 10

	// 叠加提醒间隔（分钟）
	// 弹框确认后，每隔这个时间再次弹框（如果问题还在）
	RepeatInterval int `yaml:"repeat_interval_minutes"` // 默认 5

	// 是否启用弹框通知
	Enabled bool `yaml:"enabled"` // 默认 true
}

// WorkingHours 工作时间窗口配置（24小时制）
type WorkingHours struct {
	Start string `yaml:"start"` // 开始时间，格式 "HH:MM"（如 "08:00"）
	End   string `yaml:"end"`   // 结束时间，格式 "HH:MM"（如 "01:00"，支持跨午夜）
}

// ConfigDir 返回配置目录路径（~/.config/kanban-watcher）
func ConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("获取用户主目录: %w", err)
	}
	return filepath.Join(home, ".config", "kanban-watcher"), nil
}

// ConfigPath 返回完整配置文件路径
func ConfigPath() (string, error) {
	dir, err := ConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.yaml"), nil
}

// LoadConfig 读取 YAML 配置文件并填充默认值
// 若配置文件不存在，则自动创建示例文件并使用默认配置
func LoadConfig() (*Config, error) {
	path, err := ConfigPath()
	if err != nil {
		return nil, err
	}

	cfg := defaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// 首次运行：使用默认配置，并写入示例文件供用户参考
			if writeErr := writeExampleConfig(path); writeErr != nil {
				fmt.Fprintf(os.Stderr, "警告: 无法写入示例配置: %v\n", writeErr)
			}
			return cfg, nil
		}
		return nil, fmt.Errorf("读取配置 %s: %w", path, err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("解析配置 %s: %w", path, err)
	}

	applyDefaults(cfg)
	return cfg, nil
}

// MustLoad 加载配置，出错时直接退出程序（用于启动时）
func MustLoad() *Config {
	cfg, err := LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "致命错误: 加载配置失败: %v\n", err)
		os.Exit(1)
	}
	return cfg
}

// defaultConfig 返回默认配置实例
func defaultConfig() *Config {
	return &Config{
		KanbanAPIURL: "http://127.0.0.1:7777",
		ConversationSync: ConversationSyncConfig{
			Enabled:             boolPtr(true),
			RecentMessageLimit:  20,
			RecentToolCallLimit: 5,
		},
		WeChat: WeChatConfig{
			ToUser:                 "@all",
			NotifyThresholdMinutes: 10, // 默认 10 分钟阈值
		},
		Notify: NotifyConfig{
			ApprovalThreshold: 15,  // 待审批 15 分钟
			MessageThreshold:  15, // 未读消息 15 分钟
			RepeatInterval:    5,  // 叠加提醒间隔 5 分钟
			Enabled:           true,
		},
		WorkingHours: WorkingHours{
			Start: "08:00",
			End:   "01:00", // 跨午夜：08:00 到次日 01:00
		},
		PollIntervalSecs: 15, // 默认 15 秒轮询一次
		HTTPAPI: HTTPAPIConfig{
			Port:   7778,
			APIKey: "change-me",
		},
		Auth: AuthConfig{
			TokenExpireDays: 30,
			Users: []UserConfig{
				{Username: "admin", PasswordHash: ""},
			},
		},
	}
}

// applyDefaults 为未设置的字段填充默认值
func applyDefaults(cfg *Config) {
	if cfg.KanbanAPIURL == "" {
		cfg.KanbanAPIURL = "http://127.0.0.1:7777"
	}
	if cfg.WeChat.NotifyThresholdMinutes <= 0 {
		cfg.WeChat.NotifyThresholdMinutes = 10
	}
	if cfg.ConversationSync.RecentMessageLimit <= 0 {
		cfg.ConversationSync.RecentMessageLimit = 20
	}
	if cfg.ConversationSync.RecentToolCallLimit <= 0 {
		cfg.ConversationSync.RecentToolCallLimit = 5
	}
	if cfg.ConversationSync.SessionPreservedDays <= 0 {
		cfg.ConversationSync.SessionPreservedDays = 3 // 默认保留 3 天
	}
	if cfg.ConversationSync.SessionCleanupHours <= 0 {
		cfg.ConversationSync.SessionCleanupHours = 1 // 默认每小时清理一次
	}
	if cfg.ConversationSync.Enabled == nil {
		cfg.ConversationSync.Enabled = boolPtr(true)
	}
	if cfg.WeChat.ToUser == "" {
		cfg.WeChat.ToUser = "@all"
	}
	if cfg.WorkingHours.Start == "" {
		cfg.WorkingHours.Start = "08:00"
	}
	if cfg.WorkingHours.End == "" {
		cfg.WorkingHours.End = "01:00"
	}
	if cfg.PollIntervalSecs <= 0 {
		cfg.PollIntervalSecs = 15
	}
	if cfg.HTTPAPI.Port <= 0 {
		cfg.HTTPAPI.Port = 7778
	}
	if cfg.HTTPAPI.APIKey == "" {
		cfg.HTTPAPI.APIKey = "change-me"
	}

	// 支持环境变量覆盖端口配置（用于多实例开发）
	if portStr := os.Getenv("KANBAN_PORT"); portStr != "" {
		if port, err := strconv.Atoi(portStr); err == nil && port > 0 {
			cfg.HTTPAPI.Port = port
		}
	}
	if cfg.Notify.ApprovalThreshold <= 0 {
		cfg.Notify.ApprovalThreshold = 15
	}
	if cfg.Notify.MessageThreshold <= 0 {
		cfg.Notify.MessageThreshold = 15
	}
	if cfg.Notify.RepeatInterval <= 0 {
		cfg.Notify.RepeatInterval = 5
	}
	if cfg.TokenStats.SyncIntervalHours <= 0 {
		cfg.TokenStats.SyncIntervalHours = 1 // 默认每小时同步
	}
	if cfg.TokenStats.Enabled == nil {
		cfg.TokenStats.Enabled = boolPtr(true)
	}
	// 认证配置默认值
	if cfg.Auth.TokenExpireDays <= 0 {
		cfg.Auth.TokenExpireDays = 30
	}
	if len(cfg.Auth.Users) == 0 {
		cfg.Auth.Users = []UserConfig{
			{Username: "admin", PasswordHash: ""},
		}
	}
}

func (c ConversationSyncConfig) IsEnabled() bool {
	return c.Enabled == nil || *c.Enabled
}

func boolPtr(v bool) *bool {
	return &v
}

// writeExampleConfig 将默认配置写入指定路径作为示例
func writeExampleConfig(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	example := defaultConfig()
	example.WeChat.CorpID = "ww1234567890abcdef"
	example.WeChat.AgentID = "1000001"
	example.WeChat.Secret = "YOUR_SECRET"
	example.WeChat.ToUser = "@all"
	example.HTTPAPI.APIKey = "YOUR_API_KEY"
	data, err := yaml.Marshal(example)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
