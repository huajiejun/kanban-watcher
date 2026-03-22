package markdown

import (
	"testing"
)

func TestFormatContent(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty content",
			input:    "",
			expected: "",
		},
		{
			name:     "plain text",
			input:    "Hello, World!",
			expected: "Hello, World!",
		},
		{
			name:     "h3 header",
			input:    "### 标题\n内容",
			expected: "**标题**\n内容",
		},
		{
			name:     "h2 header",
			input:    "## 标题\n内容",
			expected: "**标题**\n内容",
		},
		{
			name:     "h1 header",
			input:    "# 标题\n内容",
			expected: "**标题**\n内容",
		},
		{
			name:     "code block with language",
			input:    "```go\nfmt.Println(\"Hello\")\n```",
			expected: "**go**\n```\nfmt.Println(\"Hello\")\n```",
		},
		{
			name:     "code block without language",
			input:    "```\ncode here\n```",
			expected: "```\ncode here\n```",
		},
		{
			name:     "mixed content",
			input:    "### 说明\n这是一段说明\n```python\nprint('hello')\n```",
			expected: "**说明**\n这是一段说明\n**python**\n```\nprint('hello')\n```",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := FormatContent(tt.input)
			if result != tt.expected {
				t.Errorf("FormatContent() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestFormatHeaders(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "h3 header",
			input:    "### Title",
			expected: "**Title**",
		},
		{
			name:     "h2 header",
			input:    "## Title",
			expected: "**Title**",
		},
		{
			name:     "h1 header",
			input:    "# Title",
			expected: "**Title**",
		},
		{
			name:     "no header",
			input:    "Just text",
			expected: "Just text",
		},
		{
			name:     "multiple headers",
			input:    "# Main\n## Sub\n### Detail",
			expected: "**Main**\n**Sub**\n**Detail**",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatHeaders(tt.input)
			if result != tt.expected {
				t.Errorf("formatHeaders() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestTruncateWithCodeBlocks(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		maxLen   int
		expected string
	}{
		{
			name:     "no truncation needed",
			input:    "short text",
			maxLen:   100,
			expected: "short text",
		},
		{
			name:     "simple truncation",
			input:    "this is a very long text that needs to be truncated",
			maxLen:   20,
			expected: "this is a very lo...",
		},
		{
			name:     "truncate with code block",
			input:    "some text ```code block here``` more text",
			maxLen:   25,
			expected: "some text ...",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := TruncateWithCodeBlocks(tt.input, tt.maxLen)
			if result != tt.expected {
				t.Errorf("TruncateWithCodeBlocks() = %q, want %q", result, tt.expected)
			}
		})
	}
}
