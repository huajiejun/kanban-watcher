package config

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// IsWorkingHours 判断给定时间是否在工作时间窗口内
// 核心逻辑：支持跨午夜的时间窗口（如 08:00 到次日 01:00）
//
// 算法说明：
//   - 将时间转换为距午夜 00:00 的分钟数（0-1439）
//   - 若 end > start：同日窗口（如 09:00-18:00），需满足 start <= cur < end
//   - 若 end < start：跨午夜窗口（如 08:00-01:00），需满足 cur >= start OR cur < end
func IsWorkingHours(wh WorkingHours, t time.Time) (bool, error) {
	startMin, err := parseHHMM(wh.Start)
	if err != nil {
		return false, fmt.Errorf("无效的工作时间起点 %q: %w", wh.Start, err)
	}
	endMin, err := parseHHMM(wh.End)
	if err != nil {
		return false, fmt.Errorf("无效的工作时间终点 %q: %w", wh.End, err)
	}

	cur := t.Hour()*60 + t.Minute()

	if endMin < startMin {
		// 跨午夜窗口示例：08:00(480)–01:00(60)
		// 工作时间：当前 >= 起点 或 当前 < 终点
		return cur >= startMin || cur < endMin, nil
	}
	// 同日窗口：当前在起点与终点之间（终点不包含）
	return cur >= startMin && cur < endMin, nil
}

// parseHHMM 解析 "HH:MM" 格式的时间字符串，返回距午夜的分钟数
func parseHHMM(s string) (int, error) {
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return 0, fmt.Errorf("期望格式 HH:MM")
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil || h < 0 || h > 23 {
		return 0, fmt.Errorf("无效小时 %q", parts[0])
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 0 || m > 59 {
		return 0, fmt.Errorf("无效分钟 %q", parts[1])
	}
	return h*60 + m, nil
}

// NextWorkStart 计算从给定时间起，下一次工作时间开始的时间点
// 用于在非工作时间暂停轮询后，计算唤醒时间
func NextWorkStart(wh WorkingHours, t time.Time) (time.Time, error) {
	startMin, err := parseHHMM(wh.Start)
	if err != nil {
		return time.Time{}, err
	}
	h := startMin / 60
	m := startMin % 60
	// 构造今日的开始时间点
	candidate := time.Date(t.Year(), t.Month(), t.Day(), h, m, 0, 0, t.Location())
	// 若今日已开始过了，则推到明天
	if !candidate.After(t) {
		candidate = candidate.Add(24 * time.Hour)
	}
	return candidate, nil
}
