package notify

import (
	"fmt"
	"os/exec"
	"strings"
)

// DialogNotifier 负责显示 macOS 原生弹框
type DialogNotifier struct{}

// NewDialogNotifier 创建弹框通知器
func NewDialogNotifier() *DialogNotifier {
	return &DialogNotifier{}
}

// ShowAndOpen 显示弹框，根据用户选择决定是否打开浏览器
// 返回：用户是否点击了"查看"
func (d *DialogNotifier) ShowAndOpen(title, message, url string) (bool, error) {
	script := fmt.Sprintf(
		`display dialog "%s" with title "%s" buttons {"查看", "忽略"} default button "查看"`,
		escapeAppleScript(message),
		escapeAppleScript(title),
	)

	cmd := exec.Command("osascript", "-e", script)
	output, _ := cmd.CombinedOutput()
	result := strings.TrimSpace(string(output))

	// 解析结果判断用户点击的按钮
	if strings.Contains(result, "查看") {
		// 用户点击"查看"，打开浏览器
		if err := exec.Command("open", url).Run(); err != nil {
			return true, fmt.Errorf("打开浏览器失败: %w", err)
		}
		return true, nil
	}

	if strings.Contains(result, "忽略") {
		return false, nil
	}

	// 其他情况（错误、超时等），视为用户取消
	return false, fmt.Errorf("unexpected dialog result: %s", result)
}

// escapeAppleScript 转义 AppleScript 特殊字符
// 使用占位符方式避免刚插入的反斜杠被再次转义
func escapeAppleScript(s string) string {
	// Step 1: 先用占位符替换引号
	s = strings.ReplaceAll(s, `"`, "QUOTE")
	// Step 2: 转义已有的反斜杠
	s = strings.ReplaceAll(s, `\`, `\\`)
	// Step 3: 将占位符替换为带反斜杠的引号
	s = strings.ReplaceAll(s, "QUOTE", `\"`)
	return s
}