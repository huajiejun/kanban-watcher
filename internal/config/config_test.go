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
