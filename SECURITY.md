# 安全说明 / Security Policy

## 中文

如果你发现安全或隐私问题，请不要在公开 Issue 中粘贴真实 AppID、OpenID、云环境 ID、订阅消息模板 ID、访问令牌、数据库截图、情侣邀请码或预览二维码。

提交报告时，请只提供：

- 受影响的功能和文件；
- 可复现步骤；
- 已脱敏的错误信息；
- 可能造成的影响；
- 建议的修复方向（如有）。

在仓库维护者提供私密报告渠道前，请先创建一个不包含敏感细节的 Issue，标题注明 `[Security] Request private contact`。维护者确认联系方式后，再私下补充复现材料。

如果敏感信息已经公开：

1. 立即撤销或替换对应凭据；
2. 删除包含信息的二维码或截图；
3. 重新部署受影响的云函数；
4. 检查云开发日志和数据库异常访问；
5. 不要只删除最新提交——凭据仍可能存在于 Git 历史中。

## English

Do not post a real AppID, OpenID, CloudBase environment ID, subscription
template ID, access token, database screenshot, invite code, or preview QR code
in a public issue.

A useful report should contain only:

- the affected feature and file;
- reproducible steps;
- sanitized error output;
- the potential impact;
- a suggested mitigation, if available.

Until a private reporting channel is published, open a detail-free issue named
`[Security] Request private contact`. Share reproduction material only after a
maintainer confirms a private contact method.

If a secret has already been exposed:

1. revoke or replace it immediately;
2. remove related QR codes and screenshots;
3. redeploy affected cloud functions;
4. inspect CloudBase logs and database access;
5. remember that deleting only the latest commit does not remove Git history.
