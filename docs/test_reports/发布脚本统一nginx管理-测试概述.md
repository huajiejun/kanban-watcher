# 发布脚本统一nginx管理-测试概述

## 测试目标

- 验证 `scripts/deploy_web_release.sh` 不再依赖发布目录内的独立 `nginx.conf`
- 验证脚本会生成 Homebrew `nginx` 的站点配置
- 验证脚本执行 `nginx -t` 与 `nginx -s reload`，不再使用 `nginx -c ...`

## 测试方式

执行命令：

```bash
bash ./scripts/test_deploy_web_release.sh
```

测试中使用了 fake `npm`、fake `rsync`、fake `nginx`、fake `brew`，避免污染本机真实服务。

## 验证结果

- `dist/web/` 成功同步到临时发布目录
- 成功生成 `servers/kanban-web-release.conf`
- 生成配置包含：
  - `listen 7779;`
  - `root <target_dir>;`
  - `proxy_pass http://127.0.0.1:7778;`
- 记录到了 `nginx -t`
- 记录到了 `nginx -s reload`
- 未出现 `nginx -c ...`
- Homebrew `nginx` 已启动场景下，脚本走 reload 分支，不会再起独立实例

## 结论

- 发布脚本已经切换为统一管理 Homebrew 主 `nginx`
- 旧的“发布目录自带 `nginx.conf` 并单独启动”链路已从脚本中移除
