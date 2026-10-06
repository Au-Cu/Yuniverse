# Yuniverse 下载统计接口

网站只记录匿名下载事件，不记录账号、IP 地址、设备标识或桌宠使用信息。

## 写入事件

- `POST /api/download-event`
- 事件：`started` 或 `completed`
- 架构：`windowsX64`、`windowsArm64`、`macosArm64`、`macosX64`
- 版本固定为 `1.0.0`
- 同一下载 ID 的同一种事件只计一次
- 服务端记录毫秒时间戳，可按分钟、小时或天聚合

## 读取统计

- `GET /api/download-stats`
- 请求头：`Authorization: Bearer <管理口令>`
- 可选参数：
  - `granularity=minute|hour|day`
  - `from=<Unix 毫秒时间戳>`
  - `to=<Unix 毫秒时间戳>`
  - `limit=1..200`

响应包含累计开始数、累计完成数、所选时段统计、平台架构分布、站点来源、时间序列及最近事件。管理口令只保存在 Cloudflare Secret 与本地交付文件中，不写入仓库。
