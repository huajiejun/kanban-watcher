package markdown

import (
	"regexp"
	"strings"
)

// FormatContent 将 markdown 内容转换为更适合显示的格式
// 处理代码块、标题等元素，确保在 Home Assistant 中正确显示
func FormatContent(content string) string {
	if content == "" {
		return ""
	}

	// 1. 处理代码块（带语言的）
	content = formatCodeBlocksWithLang(content)

	// 2. 处理代码块（不带语言的）
	content = formatCodeBlocksWithoutLang(content)

	// 3. 处理行内代码
	content = formatInlineCode(content)

	// 4. 处理标题
	content = formatHeaders(content)

	return content
}

// formatCodeBlocksWithLang 处理带语言的代码块 ```lang ... ```
func formatCodeBlocksWithLang(content string) string {
	// 匹配 ```lang\n...\n```
	re := regexp.MustCompile("```(\\w*)\n([\\s\\S]*?)\n```")
	return re.ReplaceAllStringFunc(content, func(match string) string {
		submatches := re.FindStringSubmatch(match)
		if len(submatches) < 3 {
			return match
		}
		lang := submatches[1]
		code := submatches[2]

		// 转换为带语言标识的格式
		var sb strings.Builder
		if lang != "" {
			sb.WriteString("**")
			sb.WriteString(lang)
			sb.WriteString("**\n")
		}
		sb.WriteString("```\n")
		sb.WriteString(code)
		sb.WriteString("\n```")
		return sb.String()
	})
}

// formatCodeBlocksWithoutLang 处理不带语言的代码块 ``` ... ```
func formatCodeBlocksWithoutLang(content string) string {
	// 匹配没有语言的代码块（已经处理过带语言的，这里处理剩余的）
	// 这个正则处理 ```\n...\n``` 的情况
	re := regexp.MustCompile("```\n([\\s\\S]*?)\n```")
	return re.ReplaceAllString(content, "```\n$1\n```")
}

// formatInlineCode 处理行内代码 `code`
func formatInlineCode(content string) string {
	// Home Assistant markdown 支持行内代码，保持原样
	return content
}

// formatHeaders 处理标题，将 ### 转换为更友好的格式
func formatHeaders(content string) string {
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		// 处理 ### 标题
		if strings.HasPrefix(line, "### ") {
			lines[i] = "**" + strings.TrimPrefix(line, "### ") + "**"
			continue
		}
		// 处理 ## 标题
		if strings.HasPrefix(line, "## ") {
			lines[i] = "**" + strings.TrimPrefix(line, "## ") + "**"
			continue
		}
		// 处理 # 标题
		if strings.HasPrefix(line, "# ") {
			lines[i] = "**" + strings.TrimPrefix(line, "# ") + "**"
			continue
		}
	}
	return strings.Join(lines, "\n")
}

// TruncateWithCodeBlocks 智能截断内容，确保不会截断代码块
func TruncateWithCodeBlocks(content string, maxLen int) string {
	if len(content) <= maxLen {
		return content
	}

	// 检查是否有未闭合的代码块
	truncated := content[:maxLen]
	openBlocks := strings.Count(truncated, "```")

	// 如果代码块数量是奇数，说明有未闭合的代码块
	if openBlocks%2 == 1 {
		// 找到最后一个 ``` 的位置
		lastBlock := strings.LastIndex(truncated, "```")
		if lastBlock > 0 {
			truncated = content[:lastBlock]
		}
	}

	if len(truncated) > maxLen-3 {
		return truncated[:maxLen-3] + "..."
	}
	return truncated + "..."
}
