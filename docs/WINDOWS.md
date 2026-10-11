# Windows 安装与排查

需要 Steam 桌面版 Balatro 1.0.1o、Node.js 24.13+ 和 Windows PowerShell 5.1+。
在项目目录打开 PowerShell：

```powershell
npm ci
npm run setup
npm run install:windows -- -WhatIf
```

关闭游戏并确认预览路径后执行 `npm run install:windows`，再从 Steam 启动游戏。
也可双击 `scripts/install-mod.cmd`；该入口安装 mod，Node 依赖仍需按上面准备。
安装器按需下载 Lovely v0.10.0 / Steamodded 26.1002.0，保留已有加载器。
游戏 runtime 需要提供 LuaSocket；启动后用 `npm run doctor` 检查。

## 自定义目录与离线包

```powershell
npm run install:windows -- -GameDirectory 'D:\SteamLibrary\steamapps\common\Balatro'
npm run install:windows -- -ModsDirectory 'D:\BalatroProfile\Mods'
npm run install:windows -- -UpdateLoaders
npm run install:windows -- -LovelyArchive 'D:\Downloads\lovely-x86_64-pc-windows-msvc.zip' -SteamoddedArchive 'D:\Downloads\smods-26.1002.0.zip'
```

游戏目录必须包含 `Balatro.exe`。默认 Mods 路径为 `%APPDATA%\Balatro\Mods`。
自定义 Mods 目录需要对应配置游戏加载器的 `LOVELY_MOD_DIR`，否则游戏可能读取另一个目录。
离线包来自 [Lovely 官方发布页](https://github.com/ethangreen-dev/lovely-injector/releases/tag/v0.10.0)
和 [Steamodded 官方版本](https://github.com/Steamodded/smods/tree/26.1002.0)。
`-UpdateLoaders` 在备份后替换加载器；平时无需传入。

## 备份与恢复

安装器备份整个 Balatro 用户目录至 `build/mod-install-backups/<安装-ID>/profile/`，
另外保留被替换的 mod/加载器并记录 `installation.json`。
替换失败会恢复已经改动的目标。备份包含存档和本机路径，已被 Git 忽略。
手动恢复前关闭游戏，根据安装记录恢复相应文件；清理项目前另存需要的备份。

## 排查

- PowerShell 阻止 `npm.ps1`：使用 `npm.cmd` 替代命令中的 `npm`，无需调整系统策略。
- 找不到 Steam 安装：传 `-GameDirectory`；多个安装也需显式选择。
- 提示旧的 `version.dll`：Lovely v0.10.0 改用 `winmm.dll`。备份并移走旧加载器后再安装，避免两份 Lovely 同时加载。
- doctor 无法连接：确认 Steamodded 已显示、本 mod 没被禁用、游戏与客户端端口一致。
  默认日志位于 `%APPDATA%\Balatro\Mods\lovely\log`。
- 客户端无法启动 Node：重新运行 `npm run mcp:config -- --force`，将生成配置合并到客户端。
  其中 Node 路径由当前实际可执行文件生成，JSON 转义也由程序处理。
- `ready: false`：查看 `notReadyReason`，关闭弹窗或等待动画后重新检查。

Windows 安装器尚未在 Windows 硬件实测；macOS 的验证结果不代表 Windows 已通过实测。
