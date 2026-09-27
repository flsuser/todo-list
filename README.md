# 日程规划与提醒（todo）

一个支持 **AI 图文识别自动建日程** 的个人日程规划与提醒网站，线上地址：`https://todo.lastmoon.online`。

## 功能特性

- **多用户**：注册 / 登录 / JWT 鉴权，数据按用户隔离；个人资料、时区、密码可自助修改。
- **多视图日程**：
  - 日历：月 / 周 / 日三种视图，月视图拖拽换日期、周/日时间轴拖拽改时间、拉伸改时长；
  - 列表：按「已过期 / 今天 / 明天 / 本周 / 以后 / 已完成」分组的时间线，勾选即完成；
  - 看板：按状态（待办 / 进行中 / 已完成）拖拽流转。
- **重复日程**：RRULE 规则（按天 / 周 / 月 / 年、指定星期、截止日），编辑/删除支持「整个日程 / 仅此次 / 此次及后续」作用范围。
- **清单分组**：自定义清单与颜色，日程可归入清单并按清单筛选。
- **到期提醒推送**：服务端每分钟扫描，命中「开始时间 − 提前分钟数」时通过 **Server酱3（微信）** 或 **钉钉机器人** 推送；浏览器打开时另有站内提醒条；推送日志可查。
- **AI 图文识别**（DeepSeek）：
  - 一句话文字或上传图片（课表、会议通知等）自动识别出多条日程草稿；
  - 草稿可逐条修改标题 / 时间 / 优先级后批量确认入库；
  - **API Key 与模型由用户在「设置 → AI 识别」自行填写**（Key 加密存库），也支持服务器环境变量兜底；文本模型与视觉模型均可自选。
- **移动端适配**：窄屏侧栏抽屉、日历/时间轴压缩、编辑弹窗全屏、表单竖排、标签页横滑。

## 技术栈

| 子项目 | 技术 |
|---|---|
| `schedule-web` | Vue 3 + TypeScript + Element Plus + Pinia + Vite |
| `schedule-api` | NestJS + Prisma + MySQL 8 + JWT + @nestjs/schedule |

## 目录结构

```
schedule-web/   前端（日历/列表/看板/AI 识别/设置）
schedule-api/   后端（auth/users/events/lists/notify/ai/upload）
```

## 本地开发

```bash
# 后端（需先配置 MySQL 与 .env，监听 3001）
cd schedule-api && npm install && npm run start:dev

# 前端（5175，/api 与 /tmp 代理到 3001）
cd schedule-web && npm install && npm run dev
```

## 部署（1Panel 服务器）

- **后端**：`schedule-api` 构建为 Docker 容器（加入 `1panel-network`，仅绑 `127.0.0.1:3001`），容器启动时自动 `prisma db push` 同步表结构；连接 1Panel MySQL 的独立 `schedule` 库。
- **前端**：本地 `vite build` 产出 `dist`，上传解压到 1Panel 静态站目录；OpenResty 将 `/api`、`/tmp` 反代到 `site-schedule-api:3001`，并配置 HTTPS 与 `client_max_body_size 0`（AI 图片上传）。
