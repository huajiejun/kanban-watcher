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

// Publisher manages the MQTT connection and publishes workspace data to HA.
type Publisher struct {
	cfg      config.MQTTConfig
	mu       sync.Mutex
	client   paho.Client
	lastJSON []byte // last published attributes JSON for change detection
}

// NewPublisher creates a Publisher. Call Connect before publishing.
func NewPublisher(cfg config.MQTTConfig) *Publisher {
	return &Publisher{cfg: cfg}
}

// Connect establishes the MQTT connection.
// If the broker is not configured, Connect is a no-op.
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
	opts.SetKeepAlive(30 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetOrderMatters(false)
	opts.SetOnConnectHandler(func(_ paho.Client) {
		fmt.Fprintf(os.Stderr, "mqtt: connected to %s\n", p.cfg.Broker)
		// Re-publish discovery on reconnect so HA picks it up
		if err := p.PublishDiscovery(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "mqtt: publish discovery after reconnect: %v\n", err)
		}
	})
	opts.SetConnectionLostHandler(func(_ paho.Client, err error) {
		fmt.Fprintf(os.Stderr, "mqtt: connection lost: %v\n", err)
	})

	client := paho.NewClient(opts)
	token := client.Connect()
	if !token.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("mqtt connect timeout")
	}
	if token.Error() != nil {
		return fmt.Errorf("mqtt connect: %w", token.Error())
	}

	p.mu.Lock()
	p.client = client
	p.mu.Unlock()
	return nil
}

// PublishDiscovery sends the HA MQTT Discovery config (retained, QoS 1).
func (p *Publisher) PublishDiscovery(ctx context.Context) error {
	p.mu.Lock()
	c := p.client
	p.mu.Unlock()

	if c == nil {
		return nil
	}

	payload, err := BuildDiscoveryJSON()
	if err != nil {
		return fmt.Errorf("build discovery payload: %w", err)
	}
	return publish(c, TopicDiscovery, 1, true, payload)
}

// PublishIfChanged publishes workspace state to MQTT only when the data has changed.
// Returns true if data was published, false if unchanged.
func (p *Publisher) PublishIfChanged(_ context.Context, workspaces []api.EnrichedWorkspace) (bool, error) {
	p.mu.Lock()
	c := p.client
	p.mu.Unlock()

	if c == nil {
		return false, nil
	}

	attrsJSON, err := BuildAttributesJSON(workspaces)
	if err != nil {
		return false, fmt.Errorf("build attributes: %w", err)
	}

	p.mu.Lock()
	unchanged := bytes.Equal(p.lastJSON, attrsJSON)
	p.mu.Unlock()

	if unchanged {
		return false, nil
	}

	stateVal := BuildStateValue(workspaces)
	if err := publish(c, TopicState, 0, true, []byte(stateVal)); err != nil {
		return false, fmt.Errorf("publish state: %w", err)
	}
	if err := publish(c, TopicAttributes, 0, true, attrsJSON); err != nil {
		return false, fmt.Errorf("publish attributes: %w", err)
	}

	p.mu.Lock()
	p.lastJSON = attrsJSON
	p.mu.Unlock()

	return true, nil
}

// Disconnect gracefully closes the MQTT connection.
func (p *Publisher) Disconnect() {
	p.mu.Lock()
	c := p.client
	p.mu.Unlock()

	if c != nil {
		c.Disconnect(500)
	}
}

// publish sends a message and waits for confirmation.
func publish(c paho.Client, topic string, qos byte, retained bool, payload []byte) error {
	token := c.Publish(topic, qos, retained, payload)
	if !token.WaitTimeout(5 * time.Second) {
		return fmt.Errorf("publish to %s timed out", topic)
	}
	return token.Error()
}
