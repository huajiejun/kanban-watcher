package mqtt

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

// Publisher 管理 MQTT 连接，向 Home Assistant 推送工作区数据
type Publisher struct {
	cfg      config.MQTTConfig // MQTT 配置
	mu       sync.Mutex        // 保护 client 和 lastJSON
	client   paho.Client       // Paho MQTT 客户端
	lastJSON []byte            // 上次发布的 attributes JSON（用于变更检测）
}

// NewPublisher 创建发布器（尚未连接，需调用 Connect）
func NewPublisher(cfg config.MQTTConfig) *Publisher {
	return &Publisher{cfg: cfg}
}

// Connect 建立 MQTT 连接
// 若 broker 未配置（空字符串），则 Connect 不执行任何操作直接返回
func (p *Publisher) Connect(ctx context.Context) error {
	if p.cfg.Broker == "" {
		return nil
	}

	opts := paho.NewClientOptions()
	opts.AddBroker(p.cfg.Broker)
	opts.SetClientID(p.cfg.ClientID)
	if p.cfg.Username != "" {
		opts.SetUsername(p.cfg.Username)
	}
	if p.cfg.Password != "" {
		opts.SetPassword(p.cfg.Password)
	}
	opts.SetKeepAlive(60 * time.Second)           // 心跳间隔改为60秒（避免Aliyun断开空闲连接）
	opts.SetPingTimeout(10 * time.Second)         //  ping超时时间
	opts.SetAutoReconnect(true)                   // 启用自动重连
	opts.SetMaxReconnectInterval(5 * time.Minute) // 最大重连间隔5分钟
	opts.SetCleanSession(false)                   // 保持会话（断开后恢复订阅）
	opts.SetOrderMatters(false)                   // 允许乱序（提高吞吐量）

	// 连接成功回调：打印日志并重新发布 Discovery
	// 重新发布确保 HA 在 broker 重启后仍能识别设备
	opts.SetOnConnectHandler(func(_ paho.Client) {
		fmt.Fprintf(os.Stderr, "mqtt: 已连接到 %s\n", p.cfg.Broker)
		if err := p.PublishDiscovery(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "mqtt: 重连后发布 discovery 失败: %v\n", err)
		}
	})

	// 连接断开回调
	opts.SetConnectionLostHandler(func(_ paho.Client, err error) {
		fmt.Fprintf(os.Stderr, "mqtt: 连接断开: %v\n", err)
	})

	client := paho.NewClient(opts)
	token := client.Connect()
	if !token.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("mqtt 连接超时")
	}
	if token.Error() != nil {
		return fmt.Errorf("mqtt 连接: %w", token.Error())
	}

	p.mu.Lock()
	p.client = client
	p.mu.Unlock()
	return nil
}

// PublishDiscovery 发送 HA MQTT Discovery 配置（retained，QoS 1）
// 保留消息确保 HA 重启后仍能立即发现设备
func (p *Publisher) PublishDiscovery(ctx context.Context) error {
	p.mu.Lock()
	c := p.client
	p.mu.Unlock()

	if c == nil {
		return nil
	}

	payload, err := BuildDiscoveryJSON()
	if err != nil {
		return fmt.Errorf("构建 discovery 载荷: %w", err)
	}
	return publish(c, TopicDiscovery, 1, true, payload)
}

// PublishIfChanged 仅当数据变更时才发布到 MQTT
// 避免 15 秒轮询产生大量重复消息，减轻 broker 负担
// 返回 true 表示已发布，false 表示数据未变更
func (p *Publisher) PublishIfChanged(_ context.Context, workspaces []api.EnrichedWorkspace) (bool, error) {
	p.mu.Lock()
	c := p.client
	p.mu.Unlock()

	if c == nil {
		return false, nil
	}

	attrsJSON, err := BuildAttributesJSON(workspaces)
	if err != nil {
		return false, fmt.Errorf("构建 attributes: %w", err)
	}

	// 变更检测：对比 JSON 字节
	p.mu.Lock()
	unchanged := bytes.Equal(p.lastJSON, attrsJSON)
	p.mu.Unlock()

	if unchanged {
		return false, nil
	}

	// 发布状态和属性
	stateVal := BuildStateValue(workspaces)
	if err := publish(c, TopicState, 0, true, []byte(stateVal)); err != nil {
		return false, fmt.Errorf("发布 state: %w", err)
	}
	if err := publish(c, TopicAttributes, 0, true, attrsJSON); err != nil {
		return false, fmt.Errorf("发布 attributes: %w", err)
	}

	// 更新缓存
	p.mu.Lock()
	p.lastJSON = attrsJSON
	p.mu.Unlock()

	return true, nil
}

// Disconnect 优雅关闭 MQTT 连接
func (p *Publisher) Disconnect() {
	p.mu.Lock()
	c := p.client
	p.mu.Unlock()

	if c != nil {
		c.Disconnect(500) // 500ms 超时等待未完成的发送
	}
}

// publish 发送消息并等待确认
func publish(c paho.Client, topic string, qos byte, retained bool, payload []byte) error {
	token := c.Publish(topic, qos, retained, payload)
	if !token.WaitTimeout(5 * time.Second) {
		return fmt.Errorf("发布到 %s 超时", topic)
	}
	return token.Error()
}
