package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config is the root configuration for kanban-watcher.
type Config struct {
	KanbanAPIURL     string       `yaml:"kanban_api_url"`
	MQTT             MQTTConfig   `yaml:"mqtt"`
	WeChat           WeChatConfig `yaml:"wechat"`
	WorkingHours     WorkingHours `yaml:"working_hours"`
	PollIntervalSecs int          `yaml:"poll_interval_seconds"`
}

// MQTTConfig holds Home Assistant MQTT broker settings.
type MQTTConfig struct {
	Broker   string `yaml:"broker"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	ClientID string `yaml:"client_id"`
}

// WeChatConfig holds enterprise WeChat bot settings.
type WeChatConfig struct {
	WebhookURL             string `yaml:"webhook_url"`
	NotifyThresholdMinutes int    `yaml:"notify_threshold_minutes"`
}

// WorkingHours defines the time window for active polling.
type WorkingHours struct {
	Start string `yaml:"start"` // "HH:MM" format
	End   string `yaml:"end"`   // "HH:MM" format
}

// ConfigDir returns the user config directory for kanban-watcher.
func ConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get home dir: %w", err)
	}
	return filepath.Join(home, ".config", "kanban-watcher"), nil
}

// ConfigPath returns the full path to the config file.
func ConfigPath() (string, error) {
	dir, err := ConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.yaml"), nil
}

// LoadConfig reads the YAML config file and applies defaults for missing values.
func LoadConfig() (*Config, error) {
	path, err := ConfigPath()
	if err != nil {
		return nil, err
	}

	cfg := defaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// No config file: use defaults and write example
			if writeErr := writeExampleConfig(path); writeErr != nil {
				fmt.Fprintf(os.Stderr, "warning: could not write example config: %v\n", writeErr)
			}
			return cfg, nil
		}
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}

	applyDefaults(cfg)
	return cfg, nil
}

// MustLoad loads config or exits on error.
func MustLoad() *Config {
	cfg, err := LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "fatal: load config: %v\n", err)
		os.Exit(1)
	}
	return cfg
}

func defaultConfig() *Config {
	return &Config{
		KanbanAPIURL: "http://127.0.0.1:7777",
		MQTT: MQTTConfig{
			Broker:   "tcp://homeassistant.local:1883",
			ClientID: "kanban-watcher",
		},
		WeChat: WeChatConfig{
			NotifyThresholdMinutes: 10,
		},
		WorkingHours: WorkingHours{
			Start: "08:00",
			End:   "01:00",
		},
		PollIntervalSecs: 15,
	}
}

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

func writeExampleConfig(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	example := defaultConfig()
	example.WeChat.WebhookURL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
	data, err := yaml.Marshal(example)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
