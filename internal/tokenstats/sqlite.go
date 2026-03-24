package tokenstats

import (
	"database/sql"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// SessionMeta session 元数据
type SessionMeta struct {
	ID        string
	Executor  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ReadSessionMeta 从 vibe-kanban SQLite 读取 session 元数据
func ReadSessionMeta(dbPath string) (map[string]*SessionMeta, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	query := `SELECT hex(id), executor, created_at, updated_at FROM sessions`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]*SessionMeta)
	for rows.Next() {
		var id string
		var executor string
		var createdAtStr, updatedAtStr string
		if err := rows.Scan(&id, &executor, &createdAtStr, &updatedAtStr); err != nil {
			continue
		}

		createdAt, _ := parseSQLiteDatetime(createdAtStr)
		updatedAt, _ := parseSQLiteDatetime(updatedAtStr)

		// SQLite ID 是 32 字符的十六进制字符串 (无 dashes)
		// 文件路径中的 session ID 格式: xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (带 dashes)
		// 例如: 32C55495DA864BFCBF3CA90AA8B6EE09 -> 32c55495-da86-4bfc-bf3c-a90aa8b6ee09
		idFormatted := formatSessionID(strings.ToLower(id))

		result[idFormatted] = &SessionMeta{
			ID:        idFormatted,
			Executor:  executor,
			CreatedAt: createdAt,
			UpdatedAt: updatedAt,
		}
	}

	return result, nil
}

// formatSessionID 将 32 字符十六进制字符串转换为带 dashes 的格式
// 例如: 32c55495da864bfcbf3ca90aa8b6ee09 -> 32c55495-da86-4bfc-bf3c-a90aa8b6ee09
func formatSessionID(id string) string {
	// UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
	if len(id) != 32 {
		return id
	}
	var b strings.Builder
	b.WriteString(id[0:8])
	b.WriteString("-")
	b.WriteString(id[8:12])
	b.WriteString("-")
	b.WriteString(id[12:16])
	b.WriteString("-")
	b.WriteString(id[16:20])
	b.WriteString("-")
	b.WriteString(id[20:32])
	return b.String()
}

// parseSQLiteDatetime 解析 SQLite 的 datetime 字符串
func parseSQLiteDatetime(s string) (time.Time, error) {
	// SQLite datetime 格式: "2026-03-23 15:23:21.584"
 layouts := []string{
		"2006-01-02 15:04:05.999",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05.999",
		"2006-01-02T15:04:05",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, nil
}
