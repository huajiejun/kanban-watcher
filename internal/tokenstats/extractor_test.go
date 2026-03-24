package tokenstats

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractFromJSONL(t *testing.T) {
	// 创建临时 JSONL 文件
	tmpDir := t.TempDir()
	jsonlPath := filepath.Join(tmpDir, "test.jsonl")

	// 写入测试数据（正确的 codex event 格式）
	testData := `{"method":"codex/event/token_count","params":{"id":"019d1e7b-4287-7a10-992c-eaa25a4aedfb","msg":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1000,"output_tokens":500,"total_tokens":1500},"model_context_window":200000}}}}
`
	if err := os.WriteFile(jsonlPath, []byte(testData), 0644); err != nil {
		t.Fatalf("写入测试文件失败: %v", err)
	}

	token, err := ExtractFromJSONL(jsonlPath)
	if err != nil {
		t.Fatalf("ExtractFromJSONL 失败: %v", err)
	}
	if token == nil {
		t.Fatal("期望返回 token 数据，实际为 nil")
	}
	if token.TotalTokens != 1500 {
		t.Errorf("期望 total_tokens=1500，实际=%d", token.TotalTokens)
	}
	if token.InputTokens != 1000 {
		t.Errorf("期望 input_tokens=1000，实际=%d", token.InputTokens)
	}
	if token.OutputTokens != 500 {
		t.Errorf("期望 output_tokens=500，实际=%d", token.OutputTokens)
	}
}