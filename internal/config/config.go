package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config kanban-watcher 的根配置结构
type Config struct {
	KanbanAPIURL     string                 `yaml:"kanban_api_url"`        // vibe-kanban API 地址
	MQTT             MQTTConfig             `yaml:"mqtt"`                  // MQTT 连接配置
	ConversationSync ConversationSyncConfig `yaml:"conversation_sync"`     // 会话日志同步配置
	WeChat           WeChatConfig           `yaml:"wechat"`                // 企业微信通知配置
	WorkingHours     WorkingHours           `yaml:"working_hours"`         // 工作时间窗口
	PollIntervalSecs int                    `yaml:"poll_interval_seconds"` // 轮询间隔（秒）
	Database         DatabaseConfig         `yaml:"database"`              // 数据库配置
}

// DatabaseConfig 数据库连接参数
type DatabaseConfig struct {
	Host     string `yaml:"host"`     // 数据库主机地址
	Port     int    `yaml:"port"`     // 数据库端口
	User     string `yaml:"user"`     // 用户名
	Password string `yaml:"password"` // 密码
	Database string `yaml:"database"` // 数据库名
}

// DSN 生成数据库连接字符串
func (c DatabaseConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		c.User, c.Password, c.Host, c.Port, c.Database)
}

// MQTTConfig MQTT Broker 连接参数
type MQTTConfig struct {
	Broker   string `yaml:"broker"`    // 服务器地址，如 tcp://192.168.1.100:1883
	Username string `yaml:"username"`  // 用户名（留空表示无认证）
	Password string `yaml:"password"`  // 密码
	ClientID string `yaml:"client_id"` // 客户端标识符，需全局唯一
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
		MQTT: MQTTConfig{
			Broker:   "tcp://homeassistant.local:1883",
			ClientID: "kanban-watcher",
		},
		ConversationSync: ConversationSyncConfig{
			Enabled:             boolPtr(true),
			RecentMessageLimit:  20,
			RecentToolCallLimit: 5,
		},
		WeChat: WeChatConfig{
			ToUser:                 "@all",
			NotifyThresholdMinutes: 10, // 默认 10 分钟阈值
		},
		WorkingHours: WorkingHours{
			Start: "08:00",
			End:   "01:00", // 跨午夜：08:00 到次日 01:00
		},
		PollIntervalSecs: 15, // 默认 15 秒轮询一次
	}
}

// applyDefaults 为未设置的字段填充默认值
func applyDefaults(cfg *Config) {
	if cfg.KanbanAPIURL == "" {
		cfg.KanbanAPIURL = "http://127.0.0.1:7777"
	}
	if cfg.MQTT.ClientID == "" {
		cfg.MQTT.ClientID = "kanban-watcher"
	}
	if cfg.MQTT.Broker == "" {
		cfg.MQTT.Broker = "tcp://homeassistant.local:1883"
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
	data, err := yaml.Marshal(example)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
