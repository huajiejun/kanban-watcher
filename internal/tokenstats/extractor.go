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

// SessionToken session 级别的 token 汇总
type SessionToken struct {
	SessionID  string
	Executor   string
	TokenInfo  TokenInfo
	LastSeenAt time.Time
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

// ExtractFromJSONL 从单个 JSONL 文件提取 token 数据
func ExtractFromJSONL(path string) (*TokenCount, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var latestTotal TokenCount
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

		// 内部是另一个 JSON 字符串
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

		latestTotal = params.Msg.Info.TotalUsage
	}

	if latestTotal.TotalTokens == 0 {
		return nil, nil
	}
	return &latestTotal, nil
}

// CollectSessionTokens 收集目录下所有 session 的 token 数据
func CollectSessionTokens(baseDir string) ([]SessionToken, error) {
	sessionsDir := filepath.Join(baseDir, "sessions")
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return nil, err
	}

	var results []SessionToken
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
				tokenCount, err := ExtractFromJSONL(filepath.Join(processDir, pf.Name()))
				if err != nil || tokenCount == nil {
					continue
				}
				results = append(results, SessionToken{
					SessionID: sessionID,
					TokenInfo: TokenInfo{
						TotalUsage: *tokenCount,
					},
				})
			}
		}
	}
	return results, nil
}