# 发布干净源码

## 检查和导出

```sh
npm ci
npm run check
npm test
npm run release:check
npm run release:export
```

导出器依据 `src/distribution.ts` 的明确文件列表复制源码，检查个人 home 路径、邮箱、
常见凭据、私钥、原始游戏实例标识、私有配置和二进制文件，拒绝符号链接。
检查只输出文件位置及问题类别，不输出命中的敏感内容。
检查基于模式匹配，新增素材及其他私人内容仍需人工审阅。

输出在 `build/releases/`，包含源码文件夹与同名 `.tar.gz`。
归档统一使用数字 owner/group 0，并排除 macOS 扩展属性，避免文件元数据带出本机用户名。
不需要游戏、模型凭据或旁边的源码项目；导出也不读取存档或运行记忆。
以下内容不会进入导出：

- `.git` 及原有提交作者、邮箱、提交信息和历史版本。
- `mcp.local.json`、其他本机配置、环境文件和凭据。
- `data/`、日志、轨迹、游戏存档及 `build/` 中的安装备份。
- `node_modules/`、`dist/` 和其他生成文件。

不要用整个工作目录打包；也不要直接把原 checkout 推到新公共仓库。
`.gitignore` 不会移除已存在于提交历史中的信息。

## 初始化 GitHub 仓库

进入导出的源码文件夹，新建 Git 仓库。填写公开署名和 GitHub 设置中提供的
**noreply 提交邮箱**，避免使用私人邮箱：

```sh
git init -b main
git config user.name 'YOUR_PUBLIC_NAME'
git config user.email 'YOUR_GITHUB_NOREPLY_EMAIL'
git add .
git commit -m 'Initial public release'
```

`YOUR_PUBLIC_NAME` 和 `YOUR_GITHUB_NOREPLY_EMAIL` 是占位符，应替换后执行。
在 GitHub 创建空仓库，按其页面给出的命令设置 remote 并推送。
也可从干净源码文件夹上传文件，或将 `.tar.gz` 作为 Release 附件。
不要将原项目的 `.git` 复制进去。

## 验证范围与许可

CI 在 Ubuntu 和 macOS 上执行类型检查、测试、mod 打包和源码脱敏检查。
它不会下载/启动游戏，也不代表 Windows 或 Intel 硬件已经实测。
源码包保留 `package-lock.json`，新用户使用 `npm ci` 和 `npm run setup`。

代码使用 MIT；保留 `LICENSE`、`licenses/` 以及技能中的第三方署名和授权说明。
Wiki 衍生资料仍使用其 CC BY-NC-SA 3.0 许可，不纳入代码的 MIT 授权。
保留来源信息和代码哈希；去除私人机器路径及 Git 身份不影响第三方署名。
