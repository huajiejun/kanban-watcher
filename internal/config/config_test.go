package config

import "testing"

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
