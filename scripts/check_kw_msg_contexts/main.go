package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	dsn := "root:Ywldtc@1991@tcp(home.huajiejun.cn:3306)/kanban_watcher?charset=utf8mb4&parseTime=true&loc=Local"

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	queries := []string{
		"SELECT COUNT(*) AS msg_context_count FROM kw_msg_contexts",
		"SELECT workspace_id, session_id, executor, variant, default_send_mode, updated_at FROM kw_msg_contexts ORDER BY updated_at DESC LIMIT 10",
	}

	for _, q := range queries {
		fmt.Println("SQL>", q)
		rows, err := db.Query(q)
		if err != nil {
			fmt.Println("ERR:", err)
			continue
		}

		cols, _ := rows.Columns()
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}

		for rows.Next() {
			if err := rows.Scan(ptrs...); err != nil {
				panic(err)
			}
			for i, c := range cols {
				switch v := vals[i].(type) {
				case []byte:
					fmt.Printf("%s=%s ", c, string(v))
				default:
					fmt.Printf("%s=%v ", c, v)
				}
			}
			fmt.Println()
		}
		rows.Close()
	}
}
