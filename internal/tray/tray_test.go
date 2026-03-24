package tray

import (
	"bytes"
	"testing"
)

func TestStatusIconBytesReturnsNormalWhenNoAttention(t *testing.T) {
	if !bytes.Equal(statusIconBytes(0), iconNormal) {
		t.Fatal("无告警时应返回普通图标")
	}
}

func TestStatusIconBytesReturnsAlertWhenAttentionExists(t *testing.T) {
	if !bytes.Equal(statusIconBytes(1), iconAlert) {
		t.Fatal("有告警时应返回告警图标")
	}
}

func TestEmbeddedTrayIconsExist(t *testing.T) {
	if len(iconNormal) == 0 {
		t.Fatal("普通托盘图标不能为空")
	}
	if len(iconAlert) == 0 {
		t.Fatal("告警托盘图标不能为空")
	}
}
