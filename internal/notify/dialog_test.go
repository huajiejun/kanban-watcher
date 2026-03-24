package notify

import (
	"testing"
)

func TestEscapeAppleScript(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{`hello`, `hello`},
		// Case 2: input `hello"world` with 1 backslash+1 quote (11 chars), output should escape both: 12 chars
		{`hello"world`, `hello\"world`},
		// Case 3: input `hello\world` with 1 backslash (11 chars), output should escape: 12 chars
		{`hello\world`, `hello\\world`},
		// Case 4: input `hello\\"world` with 2 backslashes+1 quote (12 chars), output should escape all: 16 chars
		{`hello\\"world`, `hello\\\\\"world`},
	}

	for _, tt := range tests {
		result := escapeAppleScript(tt.input)
		if result != tt.expected {
			t.Errorf("escapeAppleScript(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}