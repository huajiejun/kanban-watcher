package config

import (
	"testing"
	"time"
)

func TestIsWorkingHours(t *testing.T) {
	wh := WorkingHours{Start: "08:00", End: "01:00"}

	cases := []struct {
		name string
		hour int
		min  int
		want bool
	}{
		{"开始时刻", 8, 0, true},
		{"工作中午", 12, 0, true},
		{"晚上工作", 22, 30, true},
		{"午夜内", 0, 30, true},
		{"终止边界前", 0, 59, true},
		{"终止边界", 1, 0, false},  // end=01:00 不含在内
		{"休息时间", 2, 0, false},
		{"早晨未开始", 7, 59, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Date(2026, 3, 21, tc.hour, tc.min, 0, 0, time.Local)
			got, err := IsWorkingHours(wh, now)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("IsWorkingHours at %02d:%02d = %v, want %v", tc.hour, tc.min, got, tc.want)
			}
		})
	}
}

func TestIsWorkingHours_SameDayWindow(t *testing.T) {
	// 同日窗口：09:00–18:00
	wh := WorkingHours{Start: "09:00", End: "18:00"}

	cases := []struct {
		name string
		hour int
		want bool
	}{
		{"开始前", 8, false},
		{"开始", 9, true},
		{"结束前", 17, true},
		{"结束", 18, false},
		{"结束后", 19, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Date(2026, 3, 21, tc.hour, 0, 0, 0, time.Local)
			got, err := IsWorkingHours(wh, now)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("hour=%d: got %v, want %v", tc.hour, got, tc.want)
			}
		})
	}
}

func TestParseHHMM_InvalidFormats(t *testing.T) {
	// These should fail: missing colon, out-of-range values, or non-numeric
	invalid := []string{"", "2500", "25:00", "08:60", "abc", ":00", "08:"}
	for _, s := range invalid {
		_, err := parseHHMM(s)
		if err == nil {
			t.Errorf("parseHHMM(%q) expected error, got nil", s)
		}
	}
}

func TestParseHHMM_ValidFormats(t *testing.T) {
	cases := []struct {
		input string
		want  int
	}{
		{"08:00", 480},
		{"8:00", 480},  // single-digit hour is acceptable
		{"00:00", 0},
		{"23:59", 23*60 + 59},
		{"01:00", 60},
	}
	for _, tc := range cases {
		got, err := parseHHMM(tc.input)
		if err != nil {
			t.Errorf("parseHHMM(%q) unexpected error: %v", tc.input, err)
		}
		if got != tc.want {
			t.Errorf("parseHHMM(%q) = %d, want %d", tc.input, got, tc.want)
		}
	}
}
