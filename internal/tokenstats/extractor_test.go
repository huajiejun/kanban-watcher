package tokenstats

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractTokenDeltasFromJSONL(t *testing.T) {
	// 创建临时 JSONL 文件
	tmpDir := t.TempDir()
	jsonlPath := filepath.Join(tmpDir, "test.jsonl")

	// 写入测试数据（双层 envelope 格式）
	testData := `{"Stdout":"{\"method\":\"codex/event/token_count\",\"params\":{\"id\":\"019d1e7b-4287-7a10-992c-eaa25a4aedfb\",\"msg\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":1000,\"output_tokens\":500,\"total_tokens\":1500},\"model_context_window\":200000}}}}"}
{"Stdout":"{\"method\":\"codex/event/token_count\",\"params\":{\"id\":\"019d1e7b-4287-7a10-992c-eaa25a4aedfb\",\"msg\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":2000,\"output_tokens\":800,\"total_tokens\":2800},\"model_context_window\":200000}}}}"}
`
	if err := os.WriteFile(jsonlPath, []byte(testData), 0644); err != nil {
		t.Fatalf("写入测试文件失败: %v", err)
	}

	deltas, err := ExtractTokenDeltasFromJSONL(jsonlPath)
	if err != nil {
		t.Fatalf("ExtractTokenDeltasFromJSONL 失败: %v", err)
	}
	if len(deltas) != 1 {
		t.Fatalf("期望返回 1 条增量，实际=%d", len(deltas))
	}

	// 第一条记录：2000-1000=1000 input, 2800-1500=1300 total
	delta := deltas[0]
	if delta.TotalDelta != 1300 {
		t.Errorf("期望 total_delta=1300，实际=%d", delta.TotalDelta)
	}
	if delta.InputDelta != 1000 {
		t.Errorf("期望 input_delta=1000，实际=%d", delta.InputDelta)
	}
	if delta.OutputDelta != 300 {
		t.Errorf("期望 output_delta=300，实际=%d", delta.OutputDelta)
	}
}
