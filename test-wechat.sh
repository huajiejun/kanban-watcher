#!/bin/bash
# 测试企业微信机器人 Webhook

echo "正在测试企业微信机器人..."

WEBHOOK_URL="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=79fa6315-427d-4084-b471-efe35ffe9b04"

# 发送测试消息
curl -s -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{
    "msgtype": "markdown",
    "markdown": {
      "content": "## 🎉 Kanban 监视器测试消息\n\n这是来自 kanban-watcher 的测试通知！\n\n**时间**: '$(date "+%Y-%m-%d %H:%M:%S")'\n**状态**: ✅ Webhook 配置成功"
    }
  }'

echo ""
echo "测试消息已发送，请检查企业微信群是否收到通知"
