package config

import (
	"strings"
	"testing"
)

func TestApplyDefaultsSetsConversationSyncDefaults(t *testing.T) {
	cfg := &Config{}

	applyDefaults(cfg)

	if !cfg.ConversationSync.IsEnabled() {
		t.Fatalf("conversation sync enabled = false, want true")
	}
	if cfg.ConversationSync.RecentMessageLimit != 20 {
		t.Fatalf("recent message limit = %d, want 20", cfg.ConversationSync.RecentMessageLimit)
	}
	if cfg.ConversationSync.RecentToolCallLimit != 5 {
		t.Fatalf("recent tool call limit = %d, want 5", cfg.ConversationSync.RecentToolCallLimit)
	}
	if cfg.HTTPAPI.Port != 7778 {
		t.Fatalf("http api port = %d, want 7778", cfg.HTTPAPI.Port)
	}
	if cfg.HTTPAPI.APIKey != "change-me" {
		t.Fatalf("http api key = %q, want change-me", cfg.HTTPAPI.APIKey)
	}
}

func TestApplyDefaultsPreservesDisabledConversationSync(t *testing.T) {
	cfg := &Config{
		ConversationSync: ConversationSyncConfig{
			Enabled: boolPtr(false),
		},
	}

	applyDefaults(cfg)

	if cfg.ConversationSync.IsEnabled() {
		t.Fatalf("conversation sync enabled = true, want false")
	}
}

func TestAuthConfigDefaults(t *testing.T) {
	cfg := defaultConfig()

	// 验证默认认证配置
	if cfg.Auth.TokenExpireDays != 30 {
		t.Errorf("期望 TokenExpireDays=30, 得到 %d", cfg.Auth.TokenExpireDays)
	}
	if len(cfg.Auth.Users) != 1 {
		t.Errorf("期望默认 1 个用户, 得到 %d", len(cfg.Auth.Users))
	}
	if cfg.Auth.Users[0].Username != "admin" {
		t.Errorf("期望默认用户名为 admin, 得到 %s", cfg.Auth.Users[0].Username)
	}
}

func TestAuthConfigValidation(t *testing.T) {
	cfg := &Config{
		Auth: AuthConfig{
			TokenExpireDays: 0,
			Users:           []UserConfig{},
		},
	}
	applyDefaults(cfg)

	if cfg.Auth.TokenExpireDays != 30 {
		t.Errorf("期望 TokenExpireDays 默认为 30, 得到 %d", cfg.Auth.TokenExpireDays)
	}
	if len(cfg.Auth.Users) != 1 || cfg.Auth.Users[0].Username != "admin" {
		t.Errorf("期望默认创建 admin 用户")
	}
}

func TestApplyDefaultsSetsRuntimeRoleByPort(t *testing.T) {
	cfg := &Config{
		HTTPAPI: HTTPAPIConfig{Port: 7778},
	}

	applyDefaults(cfg)

	if cfg.Runtime.Role != RuntimeRoleMain {
		t.Fatalf("runtime role = %q, want %q", cfg.Runtime.Role, RuntimeRoleMain)
	}
	if cfg.Runtime.RealtimeBaseURL != "http://127.0.0.1:7778" {
		t.Fatalf("realtime base url = %q, want http://127.0.0.1:7778", cfg.Runtime.RealtimeBaseURL)
	}
}

func TestApplyDefaultsSetsWorkerRoleForNonMainPort(t *testing.T) {
	cfg := &Config{
		HTTPAPI: HTTPAPIConfig{Port: 16020},
	}

	applyDefaults(cfg)

	if cfg.Runtime.Role != RuntimeRoleWorker {
		t.Fatalf("runtime role = %q, want %q", cfg.Runtime.Role, RuntimeRoleWorker)
	}
	if cfg.Runtime.RealtimeBaseURL != "http://127.0.0.1:7778" {
		t.Fatalf("realtime base url = %q, want http://127.0.0.1:7778", cfg.Runtime.RealtimeBaseURL)
	}
}

func TestApplyDefaultsPreservesExplicitRuntimeRole(t *testing.T) {
	cfg := &Config{
		HTTPAPI: HTTPAPIConfig{Port: 7778},
		Runtime: RuntimeConfig{
			Role:            RuntimeRoleWorker,
			RealtimeBaseURL: "https://main.example.com",
		},
	}

	applyDefaults(cfg)

	if cfg.Runtime.Role != RuntimeRoleWorker {
		t.Fatalf("runtime role = %q, want %q", cfg.Runtime.Role, RuntimeRoleWorker)
	}
	if cfg.Runtime.RealtimeBaseURL != "https://main.example.com" {
		t.Fatalf("realtime base url = %q, want https://main.example.com", cfg.Runtime.RealtimeBaseURL)
	}
}

func TestDatabaseConfigDSNIncludesTimeouts(t *testing.T) {
	cfg := DatabaseConfig{
		Host:                "127.0.0.1",
		Port:                3306,
		User:                "root",
		Password:            "pw",
		Database:            "kanban",
		DialTimeoutSeconds:  3,
		ReadTimeoutSeconds:  15,
		WriteTimeoutSeconds: 15,
	}

	got := cfg.DSN()

	for _, want := range []string{
		"timeout=3s",
		"readTimeout=15s",
		"writeTimeout=15s",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("dsn = %q, want substring %q", got, want)
		}
	}
}
