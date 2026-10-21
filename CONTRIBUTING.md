# Contributing / 参与贡献

欢迎改进部署体验、测试覆盖、交互可用性和文档。较大的功能变化请先提交 Issue 说明使用场景。

1. Fork 仓库并创建功能分支。
2. 执行 `npm test` 和 `npm run verify`；测试无需云端凭据。
3. 修改云端目录或共享规则后执行 `npm run sync`，同时提交生成的前端副本。
4. 为权限、并发或状态变化补充能复现问题的测试；文档调整无需增加形式化测试。
5. PR 说明问题、用户可见变化、验证方式及剩余限制。

提交前检查 `git diff --cached`。不要提交本机配置、真实照片、数据库导出、邀请码、预览二维码或凭据。安全问题请按 [SECURITY.md](SECURITY.md) 处理。

每次提交应对应实际完成的工作。请保留上游 MIT 版权声明，说明引入代码和素材的来源。AI 辅助生成的改动同样需要维护者理解和验证。

Contributions are welcome. Describe the user problem, keep changes focused, run `npm test` and `npm run verify`, and include a regression test for behavioral fixes. Preserve upstream attribution and exclude deployment settings and personal data from commits.
