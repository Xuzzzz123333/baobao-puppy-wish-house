# 部署指南

## 1. 本机配置

运行 `npm run setup`，编辑以下生成的文件。这些文件不应提交到 Git：

| 文件 | 填写内容 |
| --- | --- |
| `project.config.json` | 自己的小程序 AppID；保留 URL 校验开启 |
| `config/cloud.private.js` | 自己的 CloudBase 环境 ID |
| `config/release.private.js` | 向使用者公开的联系邮箱；备案号仅在取得后填写 |
| `cloudfunctions/puppyWishes/subscription.private.js` | 可选订阅模板、字段映射和跳转版本 |

店铺名称、称呼、开店信和插画入口位于 `config/shop.js`。示例配置只用于初始化，不会连接维护者的环境。

## 2. 云端部署

在微信开发者工具中选中自己的云开发环境，分别对 `cloudfunctions/coupleAccount` 和 `cloudfunctions/puppyWishes` 执行“上传并部署：云端安装依赖”。保留各自的 `config.json` 中所需接口权限。

当前核心集合为 `users`、`inviteCodes`、`puppyWishes`。账号函数还会初始化旧厨房兼容集合：`orders`、`dishLikes`、`dishes`、`weeklyPlans`、`orderRatings`、`occasions`、`shoppingLists`，供旧数据清理逻辑使用。

在控制台核对这些集合的客户端读写权限为关闭，例如自定义规则 `{"read":false,"write":false}`。数据通过云函数访问；仅创建集合并不能代替权限检查。运营者和云平台仍具有管理访问权限。

为 `puppyWishes` 创建非唯一组合索引 `pair_created_at`：`pairKey` 升序、`createdAt` 降序。

## 3. 可选微信消息

在公众平台选择适合实际业务的订阅模板，将模板 ID 填入 `subscription.private.js`。`fields` 的键为 `name`、`title`、`content`、`time`；值必须对应自己模板的字段标识，不能照抄别人的编号。

体验成员使用 `miniprogramState:'trial'`。正式上线时改为 `formal` 并重新部署 `puppyWishes`。接收方须主动授权；后台返回“已提交”不代表手机已经收到。当前微信外提醒覆盖心愿及其进展，其他动态可在站内信箱查看。

不启用微信消息时保留空模板 ID，站内信箱仍可用。运行配置检查时使用：

```sh
npm run verify:trial -- --without-notifications
```

启用消息则运行 `npm run verify:trial`。正式版本使用 `npm run verify:release`。检查只验证本地配置与依赖，不检查平台审批或真实后台规则。

## 4. 验收

1. 先运行 `npm test` 和 `npm run verify`。
2. 在“我们 → 单人体验”验证两个演示角色的心愿、回应和每日问题。
3. 使用两个真实微信账号，选择不同角色并通过短期邀请码绑定。
4. 验证双方发送、回信、完成确认、相册同步和答案揭晓。
5. 接收方主动订阅后，由另一方发送新心愿，检查通知接收和跳转。
6. 在测试数据上验证解除绑定后的访问限制、重新绑定隔离及删除个人数据。

真实数据删除会影响双方共享记录。正式发布还需核对名称、类目、备案、隐私保护指引和审核要求；仓库检查通过不代表可直接上架。

## English configuration summary

Run `npm run setup`, configure your own AppID, CloudBase environment and privacy contact, then deploy `coupleAccount` and `puppyWishes` with cloud dependency installation. Disable direct client access to the collections and create the compound index described above. Subscription messages are optional and require the recipient's consent. Validate with two real accounts before relying on cloud behavior; local tests use mocks.
