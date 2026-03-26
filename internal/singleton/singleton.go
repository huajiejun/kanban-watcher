// Package singleton 确保只有一个程序实例在运行
// 使用 PID 文件锁机制，支持自动清理已死亡的旧进程
package singleton

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Acquire 尝试获取单实例锁
//
// 行为：
//   - 检查 PID 文件是否存在
//   - 如果存在，读取 PID 并检查进程是否还在运行
//   - 如果旧进程还在运行，返回错误（或者可以选择 kill 它）
//   - 如果不存在或进程已死，创建 PID 文件并写入当前 PID
//
// 使用方式：在 main 函数最开始调用，若返回错误则退出程序
func Acquire(appName string) (*Lock, error) {
	return AcquireWithInstance(appName, "")
}

// AcquireWithInstance 尝试获取单实例锁，支持多个实例（通过 instanceID 区分）
// instanceID 用于区分不同的实例，例如端口号
func AcquireWithInstance(appName, instanceID string) (*Lock, error) {
	pidFile := getPidFilePathWithInstance(appName, instanceID)

	// 确保目录存在
	dir := filepath.Dir(pidFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("创建 PID 目录: %w", err)
	}

	// 检查 PID 文件是否已存在
	if _, err := os.Stat(pidFile); err == nil {
		// 文件存在，读取 PID
		data, err := os.ReadFile(pidFile)
		if err != nil {
			return nil, fmt.Errorf("读取 PID 文件: %w", err)
		}

		oldPID, err := strconv.Atoi(strings.TrimSpace(string(data)))
		if err == nil && oldPID > 0 {
			// 检查进程是否还在运行
			if isProcessRunning(oldPID) {
				// 获取旧进程的启动命令，确认是同一个程序
				if isSameProgram(oldPID) {
					return nil, fmt.Errorf("程序已在运行 (PID: %d)，请勿重复启动", oldPID)
				}
				// 是其他程序，可能是 PID 重用，删除旧文件
				fmt.Fprintf(os.Stderr, "警告: PID %d 是其他程序，删除过期的 PID 文件\n", oldPID)
			}
		}

		// 删除过期/无效的 PID 文件
		if err := os.Remove(pidFile); err != nil {
			return nil, fmt.Errorf("删除过期 PID 文件: %w", err)
		}
	}

	// 创建新的 PID 文件
	currentPID := os.Getpid()
	pidStr := strconv.Itoa(currentPID)

	// 使用临时文件+重命名，确保原子性写入
	tmpFile := pidFile + ".tmp"
	if err := os.WriteFile(tmpFile, []byte(pidStr), 0644); err != nil {
		return nil, fmt.Errorf("写入临时 PID 文件: %w", err)
	}

	if err := os.Rename(tmpFile, pidFile); err != nil {
		os.Remove(tmpFile)
		return nil, fmt.Errorf("重命名 PID 文件: %w", err)
	}

	return &Lock{
		pidFile: pidFile,
		pid:     currentPID,
	}, nil
}

// Lock 单实例锁，程序退出时自动清理 PID 文件
type Lock struct {
	pidFile string
	pid     int
}

// Release 释放锁（删除 PID 文件）
// 应在程序退出前调用，如 defer lock.Release()
func (l *Lock) Release() error {
	if l == nil {
		return nil
	}

	// 验证文件中的 PID 还是我们自己（防止误删其他进程的 PID 文件）
	data, err := os.ReadFile(l.pidFile)
	if err != nil {
		return nil // 文件已不存在，无需处理
	}

	currentPID, _ := strconv.Atoi(strings.TrimSpace(string(data)))
	if currentPID == l.pid {
		return os.Remove(l.pidFile)
	}

	return nil // PID 不匹配，不删除
}

// isProcessRunning 检查指定 PID 的进程是否还在运行
func isProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// 向进程发送信号 0 检查是否存在（不实际发送信号）
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// isSameProgram 检查指定 PID 的进程是否是同一个程序
// 通过比较进程名实现
func isSameProgram(pid int) bool {
	// 读取 /proc/PID/cmdline (Linux) 或使用 ps 命令 (macOS)
	cmdlinePath := fmt.Sprintf("/proc/%d/cmdline", pid)
	data, err := os.ReadFile(cmdlinePath)
	if err != nil {
		// macOS 或 Windows 等其他系统，使用备用方法
		return checkProcessByName(pid)
	}

	// 检查命令行是否包含程序名
	cmdline := string(data)
	return strings.Contains(cmdline, "kanban-watcher")
}

// checkProcessByName 备用方法：通过进程名检查（适用于 macOS）
func checkProcessByName(pid int) bool {
	// 简单实现：假设如果 PID 存在且我们能获取到，就认为是同一个程序
	// 更严格的实现可以使用 ps 命令或 syscall
	return true
}

// getPidFilePath 获取 PID 文件路径
// macOS: ~/Library/Application Support/kanban-watcher/kanban-watcher.pid
// Linux: ~/.config/kanban-watcher/kanban-watcher.pid
func getPidFilePath(appName string) string {
	return getPidFilePathWithInstance(appName, "")
}

// getPidFilePathWithInstance 获取带实例ID的 PID 文件路径
// 支持多实例运行，每个实例使用不同的 PID 文件
func getPidFilePathWithInstance(appName, instanceID string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		// 降级到临时目录
		if instanceID != "" {
			return filepath.Join(os.TempDir(), fmt.Sprintf("%s-%s.pid", appName, instanceID))
		}
		return filepath.Join(os.TempDir(), appName+".pid")
	}

	var pidFileName string
	if instanceID != "" {
		pidFileName = fmt.Sprintf("%s-%s.pid", appName, instanceID)
	} else {
		pidFileName = appName + ".pid"
	}

	// macOS 使用 Library/Application Support
	if os.Getenv("GOOS") == "darwin" || runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", appName, pidFileName)
	}

	// Linux/其他使用 .config
	return filepath.Join(home, ".config", appName, pidFileName)
}

// AcquireWithKill 尝试获取单实例锁，如果已有实例在运行则 kill 它
// 适用于需要强制重启的场景
func AcquireWithKill(appName string) (*Lock, error) {
	pidFile := getPidFilePath(appName)

	// 确保目录存在
	dir := filepath.Dir(pidFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("创建 PID 目录: %w", err)
	}

	// 检查 PID 文件是否已存在
	if _, err := os.Stat(pidFile); err == nil {
		data, err := os.ReadFile(pidFile)
		if err == nil {
			oldPID, _ := strconv.Atoi(strings.TrimSpace(string(data)))
			if oldPID > 0 && isProcessRunning(oldPID) {
				fmt.Fprintf(os.Stderr, "发现正在运行的实例 (PID: %d)，正在终止...\n", oldPID)

				// 发送 SIGTERM 信号，优雅退出
				process, _ := os.FindProcess(oldPID)
				if process != nil {
					process.Signal(syscall.SIGTERM)

					// 等待最多 5 秒
					for i := 0; i < 50; i++ {
						time.Sleep(100 * time.Millisecond)
						if !isProcessRunning(oldPID) {
							break
						}
					}

					// 如果还在运行，强制 kill
					if isProcessRunning(oldPID) {
						fmt.Fprintf(os.Stderr, "强制终止进程 %d\n", oldPID)
						process.Kill()
					}
				}
			}
		}

		// 删除旧 PID 文件
		os.Remove(pidFile)
	}

	// 创建新的 PID 文件
	currentPID := os.Getpid()
	pidStr := strconv.Itoa(currentPID)

	tmpFile := pidFile + ".tmp"
	if err := os.WriteFile(tmpFile, []byte(pidStr), 0644); err != nil {
		return nil, fmt.Errorf("写入临时 PID 文件: %w", err)
	}

	if err := os.Rename(tmpFile, pidFile); err != nil {
		os.Remove(tmpFile)
		return nil, fmt.Errorf("重命名 PID 文件: %w", err)
	}

	return &Lock{
		pidFile: pidFile,
		pid:     currentPID,
	}, nil
}
