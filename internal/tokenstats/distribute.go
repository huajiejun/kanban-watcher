package tokenstats

import (
	"math"
	"time"
)

// DistributeDeltasBySessionDuration 将 token 增量按 session 时长分布到各个小时
// 如果一个 session 从 10:00 运行到 14:00，产生了 10000 tokens
// 则把这 10000 tokens 平均分配到 10:00, 11:00, 12:00, 13:00, 14:00 这5个小时
func DistributeDeltasBySessionDuration(
	deltas []TokenDelta,
	sessionMetas map[string]*SessionMeta,
	fileModTimes map[string]time.Time,
) []TokenDelta {
	if len(deltas) == 0 {
		return deltas
	}

	// 按 session 分组收集 deltas
	type sessionDelta struct {
		deltas    []TokenDelta
		startTime time.Time
		endTime   time.Time
		executor  string
	}

	sessionDeltas := make(map[string]*sessionDelta)

	for _, d := range deltas {
		sd, ok := sessionDeltas[d.SessionID]
		if !ok {
			// 获取 session 元数据
			meta := sessionMetas[d.SessionID]
			endTime := fileModTimes[d.SessionID]
			if endTime.IsZero() {
				endTime = d.Timestamp
			}
			startTime := d.Timestamp
			if meta != nil {
				startTime = meta.CreatedAt
			}

			sd = &sessionDelta{
				deltas:    make([]TokenDelta, 0),
				startTime: startTime,
				endTime:   endTime,
				executor:  d.Executor,
			}
			sessionDeltas[d.SessionID] = sd
		}
		sd.deltas = append(sd.deltas, d)
	}

	// 对每个 session，将 deltas 分布到各个小时
	var result []TokenDelta

	for sessionID, sd := range sessionDeltas {
		if len(sd.deltas) == 0 {
			continue
		}

		// 计算 session 时长（小时数）
		duration := sd.endTime.Sub(sd.startTime)
		hours := math.Max(1, duration.Hours())

		// 计算每个 delta 应该分配到多少个小时
		deltaCount := float64(len(sd.deltas))
		hoursPerDelta := hours / deltaCount

		for i, d := range sd.deltas {
			// 计算这个 delta 大概在哪个时间点
			deltaPosition := float64(i) + 0.5 // 使用中点
			deltaTimeOffset := hoursPerDelta * deltaPosition
			deltaTime := sd.startTime.Add(time.Duration(deltaTimeOffset * float64(time.Hour)))

			// 标准化到小时
			hour := time.Date(deltaTime.Year(), deltaTime.Month(), deltaTime.Day(),
				deltaTime.Hour(), 0, 0, 0, deltaTime.Location())

			result = append(result, TokenDelta{
				SessionID:   sessionID,
				Executor:    sd.executor,
				InputDelta:  d.InputDelta,
				OutputDelta: d.OutputDelta,
				TotalDelta:  d.TotalDelta,
				Timestamp:   hour,
			})
		}
	}

	return result
}
