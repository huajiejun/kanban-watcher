package config

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// IsWorkingHours reports whether t falls within the configured working window.
// Handles cross-midnight ranges (e.g. 08:00–01:00).
func IsWorkingHours(wh WorkingHours, t time.Time) (bool, error) {
	startMin, err := parseHHMM(wh.Start)
	if err != nil {
		return false, fmt.Errorf("invalid working_hours.start %q: %w", wh.Start, err)
	}
	endMin, err := parseHHMM(wh.End)
	if err != nil {
		return false, fmt.Errorf("invalid working_hours.end %q: %w", wh.End, err)
	}

	cur := t.Hour()*60 + t.Minute()

	if endMin < startMin {
		// Cross-midnight window: e.g. 08:00(480)–01:00(60)
		// Working if current >= start OR current < end
		return cur >= startMin || cur < endMin, nil
	}
	// Same-day window
	return cur >= startMin && cur < endMin, nil
}

// parseHHMM parses a "HH:MM" string and returns total minutes since midnight.
func parseHHMM(s string) (int, error) {
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return 0, fmt.Errorf("expected HH:MM format")
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil || h < 0 || h > 23 {
		return 0, fmt.Errorf("invalid hour %q", parts[0])
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 0 || m > 59 {
		return 0, fmt.Errorf("invalid minute %q", parts[1])
	}
	return h*60 + m, nil
}

// NextWorkStart returns the next time after t when working hours begin.
// Useful for sleeping until the next work session.
func NextWorkStart(wh WorkingHours, t time.Time) (time.Time, error) {
	startMin, err := parseHHMM(wh.Start)
	if err != nil {
		return time.Time{}, err
	}
	h := startMin / 60
	m := startMin % 60
	candidate := time.Date(t.Year(), t.Month(), t.Day(), h, m, 0, 0, t.Location())
	if !candidate.After(t) {
		candidate = candidate.Add(24 * time.Hour)
	}
	return candidate, nil
}
