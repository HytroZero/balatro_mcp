# macOS 安装、启动与诊断

支持 Steam 的 macOS 桌面版 Balatro 1.0.1o、Apple Silicon 和 Intel。
MCP 服务使用同一套 TypeScript 工具，Lua mod 的游戏规则及网络协议无需平台分支。
需要 Node.js 24.13+；游戏自身包含的 LÖVE/LuaJIT 提供 LuaSocket。

## 常用命令

先关闭游戏：

```sh
npm ci
npm run build
npm run install:macos -- --dry-run
npm run install:macos
npm run launch:macos
```

保留启动终端，在另一个终端检查：

```sh
npm run doctor
```

运行 `npm run mcp:config` 生成本机 `mcp.local.json`，合并到 MCP 客户端配置。
该配置通过 Node 启动 `dist/src/index.js`。MCP 服务与游戏启动器是两个独立进程。
GUI 客户端找不到 `node` 时，可用 `command -v node` 查询路径，并将配置中的
`command` 改成该 Node 的绝对路径。

## 路径与芯片选择

默认查找 `~/Library/Application Support/Steam` 下的安装和 Steam 配置里的其他库，
也检查 `/Applications/Balatro.app` 与 `~/Applications/Balatro.app`。
多个安装需要显式选择。可以传游戏文件夹，也可以传 `.app`：

```sh
npm run install:macos -- --game-directory '/Volumes/Games/steamapps/common/Balatro'
npm run launch:macos -- --game-directory '/Volumes/Games/steamapps/common/Balatro/Balatro.app'
```

`--mods-directory` 默认为 `~/Library/Application Support/Balatro/Mods`，
自定义路径必须以 `Mods` 结尾，安装和启动时需传入相同路径。
启动器通过 Lovely 的 `LOVELY_MOD_DIR` 设置路径。

安装器读取游戏可执行文件与已有 `liblovely.dylib` 的 Mach-O 头检查架构。
Apple Silicon 默认 `arm64`，Intel 默认 `x86_64`；也能识别 Rosetta 下运行的 Node。
在 Apple Silicon 上使用 Intel 游戏/加载器，需要已安装 Rosetta 并在安装、启动时
均传 `--arch x86_64`。本工具不会自动安装 Rosetta。

默认安装固定版本 Lovely **v0.10.0**、Steamodded **26.1002.0**，仅在缺少时下载。
`--update-loaders` 会备份后替换现有加载器。支持离线官方包：

```sh
npm run install:macos -- \
  --lovely-archive '/path/to/lovely-aarch64-apple-darwin.tar.gz' \
  --steamodded-archive '/path/to/smods-26.1002.0.zip'
```

Intel 的 Lovely 包名为 `lovely-x86_64-apple-darwin.tar.gz`。
保留已有加载器时，无需提供或下载这些包。

## 备份与恢复

安装前检查游戏未运行。预览模式不会下载、建立备份、修改安装或启动游戏。
实际安装会备份整个 Balatro 用户目录到
`build/mod-install-backups/<时间-ID>/profile/`；被替换的加载器/mod 另外存为
`previous-N`，`installation.json` 记录原目标与备份路径。
替换出错时自动恢复已经改动的目标。

重复安装会完整替换 `balatro_mcp_mod` 文件夹，清除过时文件，避免嵌套目录。
旧版 `Mods/strategy_forge` 会先备份再移除，避免同一桥接 mod 加载两次。
安装器拒绝链接目标、重复 Steamodded 和源/目标路径重叠。
删除项目或清理 `build/` 前，保留需要的存档备份。

## 启动参数

```sh
npm run launch:macos -- --dry-run
npm run launch:macos -- --port 23456 --action-timeout 120
```

第二条将 mod 的监听端口设为 23456，Lua 动作期限设为 120 秒。
客户端需对应使用 `BALATRO_BRIDGE_URL=http://127.0.0.1:23456`、
`BALATRO_TIMEOUT_MS=150000`，或对应的 MCP CLI 参数。
设置期限应覆盖真实计分动画；超时后先检查动作结果，不要自动重试。

启动器选择正确的架构，在 `arch` 之后通过 `env` 设置 `DYLD_INSERT_LIBRARIES`，
再执行原游戏 `Balatro.app/Contents/MacOS/love`。这样也支持非默认游戏目录，
并避免把注入环境变量直接交给可能过滤 `DYLD_*` 的系统启动程序。

## 排查

- `Balatro.app not found`：确认 Steam 已安装 macOS 版，或传 `--game-directory`。
- `does not support arm64/x86_64`：游戏与加载器架构不匹配；用
  `--update-loaders` 下载匹配版本，或显式选择已配置好 Rosetta 的 Intel 运行方式。
- 系统阻止 `liblovely.dylib`：确认文件来自官方发布页，按 macOS
  “隐私与安全性”提示处理。安装器不会自动取消隔离属性或修改系统安全设置。
- 游戏打开但 doctor 无法连接：确认使用 `launch:macos` 启动、mod 没被禁用、
  端口一致；检查 `~/Library/Application Support/Balatro/Mods/lovely/log/` 的日志。
- doctor 返回 `ready:false`：查看 `notReadyReason`，关闭对话框或等待动画完成。
  `luaRuntime` 显示的是实际游戏 runtime，不应按 Windows 的版本猜测。

官方参考：[Lovely 安装说明](https://github.com/ethangreen-dev/lovely-injector#manual-installation)、
[Steamodded macOS 安装说明](https://docs.smods.dev/Installation/Installing%20Steamodded%20mac/)、
[Lovely v0.10.0 的路径设置实现](https://github.com/ethangreen-dev/lovely-injector/blob/v0.10.0/crates/lovely-core/src/lib.rs)。

## 验证记录

2026-10-10 在 Apple Silicon Mac 上完成真实安装、启动与 stdio MCP 只读调用。
实测 Balatro `1.0.1o-FULL`、Lovely `0.10.0`、Steamodded `26.1002.0`、
LuaJIT `2.1.1700008891`，主菜单返回 `ready=true`。
`game_health`、`game_observe`、`card_observe` 均成功，未开始新对局。
历史自动化测试、类型检查与构建通过；当前覆盖范围见根目录 README。
Intel 架构经过安装计划测试，未做 Intel 硬件实测。
详见 [脱敏只读结果（重命名前的历史桥接身份与工具数）](MACOS-LIVE-VALIDATION.json)。
