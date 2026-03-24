package tokenstats

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// TokenCount token 用量数据
type TokenCount struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	TotalTokens  int64 `json:"total_tokens"`
}

// TokenInfo 从 codex/event/token_count 提取的信息
type TokenInfo struct {
	TotalUsage    TokenCount `json:"total_token_usage"`
	ContextWindow int64      `json:"model_context_window"`
}

// TokenDelta 单个时间点的 token 增量
type TokenDelta struct {
	SessionID   string
	Executor    string
	InputDelta  int64
	OutputDelta int64
	TotalDelta  int64
	Timestamp   time.Time
}

// codexEvent 用于解析 codex 事件
type codexEvent struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

// codexTokenParams token_count 事件的 params
type codexTokenParams struct {
	Msg *tokenMsg `json:"msg"`
}

type tokenMsg struct {
	Info TokenInfo `json:"info"`
}

// outerEnvelope JSONL 文件的外层 envelope
type outerEnvelope struct {
	Stdout string `json:"Stdout"`
}

// ExtractTokenDeltasFromJSONL 从单个 JSONL 文件提取所有 token 增量
// 返回文件内每对相邻 token_count 事件之间的增量，使用文件修改时间作为时间戳
func ExtractTokenDeltasFromJSONL(path string) ([]TokenDelta, error) {
	fileInfo, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	fileModTime := fileInfo.ModTime()

	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var deltas []TokenDelta
	var prevTotal TokenCount

	scanner := bufio.NewScanner(file)
	const maxCapacity = 1024 * 1024
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, maxCapacity)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// 解析外层 envelope
		var outer outerEnvelope
		if err := json.Unmarshal([]byte(line), &outer); err != nil {
			continue
		}

		if outer.Stdout == "" {
			continue
		}

		// 解析内部的 codex event
		var event codexEvent
		if err := json.Unmarshal([]byte(outer.Stdout), &event); err != nil || event.Method != "codex/event/token_count" {
			continue
		}

		var params codexTokenParams
		if err := json.Unmarshal(event.Params, &params); err != nil || params.Msg == nil {
			continue
		}

		currentTotal := params.Msg.Info.TotalUsage

		// 只有在有前一个值的情况下才计算增量
		if prevTotal.TotalTokens > 0 {
			inputDelta := currentTotal.InputTokens - prevTotal.InputTokens
			outputDelta := currentTotal.OutputTokens - prevTotal.OutputTokens
			totalDelta := currentTotal.TotalTokens - prevTotal.TotalTokens

			// 忽略负增量（session 重置等情况）
			if inputDelta >= 0 && outputDelta >= 0 && totalDelta >= 0 {
				deltas = append(deltas, TokenDelta{
					InputDelta:  inputDelta,
					OutputDelta: outputDelta,
					TotalDelta:  totalDelta,
					Timestamp:   fileModTime,
				})
			}
		}

		prevTotal = currentTotal
	}

	return deltas, nil
}

// CollectTokenDeltas 收集目录下所有 session 的 token 增量数据
func CollectTokenDeltas(baseDir string) ([]TokenDelta, error) {
	sessionsDir := filepath.Join(baseDir, "sessions")
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return nil, err
	}

	var results []TokenDelta
	for _, entry := range entries {
		if !entry.IsDir() || len(entry.Name()) < 2 {
			continue
		}
		subDir := filepath.Join(sessionsDir, entry.Name())
		sessionDirs, err := os.ReadDir(subDir)
		if err != nil {
			continue
		}
		for _, sessionEntry := range sessionDirs {
			if !sessionEntry.IsDir() {
				continue
			}
			sessionID := sessionEntry.Name()
			processDir := filepath.Join(subDir, sessionID, "processes")
			processFiles, err := os.ReadDir(processDir)
			if err != nil {
				continue
			}

			for _, pf := range processFiles {
				if pf.IsDir() || filepath.Ext(pf.Name()) != ".jsonl" {
					continue
				}
				deltas, err := ExtractTokenDeltasFromJSONL(filepath.Join(processDir, pf.Name()))
				if err != nil || len(deltas) == 0 {
					continue
				}
				for i := range deltas {
					deltas[i].SessionID = sessionID
				}
				results = append(results, deltas...)
			}
		}
	}
	return results, nil
}
