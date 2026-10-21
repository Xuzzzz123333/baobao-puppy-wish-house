# 宝宝的小狗心愿屋 / Puppy Wish House

一个以小狗为信使的双人心愿微信小程序。支持心愿和回信、心情天气、共享相册、每日行动与问题、站内信箱，以及可选的微信一次性订阅消息。

原生 JavaScript / WXML / WXSS，后端使用微信云开发。当前为个人学习和体验成员内测项目，尚未正式发布。单账号演示可在「我们 → 单人体验」开启；真实互动需要部署自己的云环境并绑定另一位使用者。

## 来源与许可

本项目基于 [jiaotashidi-bi/liangren-kaifan](https://github.com/jiaotashidi-bi/liangren-kaifan) 的 MIT 代码改造，复用账号、邀请码绑定和部分基础代码。当前路由围绕双人心愿重写；旧厨房代码仍保留在源码中，不属于当前开放的页面。原始版权声明保存在 [LICENSE](LICENSE)。

插画由 AI 辅助生成，提示词和原图保存在 assets 中。项目不包含使用者真实照片、数据库备份或部署凭据。

## 功能

| 功能 | 当前实现 |
| --- | --- |
| 双人心愿 | 48 个预设互动与自定义心愿，支持回信、商量时间、接下、兑现和完成确认 |
| 心情天气 | 双方主动选择心情并回应，无需位置权限 |
| 共享相册 | 上限可选 3、6、10 张，支持封面、排序、留言和小狗入口轮播 |
| 今日心动 | 180 个行动、240 个问题；双方回答后揭晓答案 |
| 动态与提醒 | 各自最近 50 条站内动态；可选微信一次性订阅消息 |
| 单账号演示 | 本机切换两个角色，体验互动流程 |

![首页使用的 AI 生成小狗插画](assets/puppy-storefront-ui.jpg)

上图为应用使用的插画，不是界面截图。微信订阅消息需要接收方授权，当前实现不提供永久订阅。真实部署的双人收发需要使用两个微信账号验收。

## 快速开始

安装 Node.js 22 或以上版本、Git 和微信开发者工具，然后执行：

```sh
git clone https://github.com/Xuzzzz123333/baobao-puppy-wish-house.git
cd baobao-puppy-wish-house
npm test
npm run verify
npm run setup
```

本地测试使用 Node 内置测试框架与数据库替身，无需安装根目录依赖或提供云端凭据。`setup` 生成被 Git 忽略的本机配置，重复执行不会覆盖已有设置。用微信开发者工具导入项目；真实云端功能请按 [部署指南](docs/DEPLOYMENT.md) 配置。

## 开发与验证

```sh
npm test                  # 单元测试、模拟云函数与客户端交互测试
npm run verify            # 目录同步、页面事件、语法、包体积估算与公开文件检查
npm run sync              # 修改云端互动目录后同步前端副本
npm run verify:trial      # 检查实际体验版部署配置
npm run verify:release    # 检查正式版部署配置
```

GitHub Actions 配置了 Linux / Windows 与 Node.js 22 / 24 的检查组合。普通检查不包含微信原生编译器；安装开发者工具后可设置 `WCC_EXEC_DIR` 指向其 `wcc-exec` 目录，再运行 `npm run verify:native`。

测试覆盖权限隔离、重新绑定后的旧数据访问、重复提交、相册并发、双向答案揭晓、已读状态与通知授权消费。模拟测试通过不代表真实云环境权限、消息送达或平台审核已通过。

## 代码结构

```text
pages/                         小店、心愿、小纸条、我们、隐私、每日互动、信箱
services/                      客户端服务与本机双角色演示
cloudfunctions/coupleAccount/  微信身份、昵称、邀请码与绑定关系
cloudfunctions/puppyWishes/    心愿、心情、相册、每日问题与提醒
data/                          从云端规则同步的前端数据
tests/                         无真实云环境依赖的测试
scripts/                       初始化、同步与发布前检查
```

服务端从微信上下文获取调用者 OpenID，并检查双方互相绑定关系及本次绑定时间。云环境运营者仍具有数据库管理权限。相册图片压缩后保存在数据库中，适合少量共享照片。

本项目仍保留上游厨房相关模块；新部署只需当前使用的两个云函数。维护者的个人主体版本曾因服务类目限制未通过审核，开源代码可供学习与内测；正式发布需由部署者核对平台要求。

欢迎通过 [贡献指南](CONTRIBUTING.md) 提交问题或改进。安全问题请先阅读 [安全说明](SECURITY.md)。

## English overview

Puppy Wish House is a native WeChat mini program for two people to exchange wishes, respond to moods, share a small photo album, and build daily rituals. It includes 48 preset wishes, custom wishes, 180 daily actions, 240 questions, an in-app inbox, and optional one-time WeChat subscription notifications.

The backend uses WeChat CloudBase. A local two-role demo and mocked tests allow contributors to explore the project without production credentials. Run `npm test`, `npm run verify`, then `npm run setup`. See the [deployment guide](docs/DEPLOYMENT.md) for the configuration files.

This is a newly published student project, derived from the MIT-licensed project credited above. It is currently intended for learning and experience-member testing, with no claim of production approval or broad adoption. AI tools assisted development, testing, documentation, and illustration; the app does not call an OpenAI API at runtime.
