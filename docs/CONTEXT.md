# 游戏规则与 Pi 技能上下文

MCP 初始化的 `instructions` 只包含简短操作约定：用户意图边界、先观察、revision、
增量状态、隐藏信息边界、取消与未知结果恢复、终局停止，以及按需资源入口。
测试限制其长度低于 2,000 个字符，避免宿主将长说明附到每个工具时重复整套规则。

`balatro://context` 按需提供原 agent 的完整参考上下文：

1. `model/prompt.ts` 中的角色与用户意图边界。
2. `model/context/balatro.md` 全文。
3. `skills/core.md` 全文。
4. Pi 1.0.4 生成的 `<available_skills>` 索引。
5. MCP 资源读取及宿主会话控制的适配说明。

前四项使用原文件及 Pi 原函数，没有压缩或截断。它们不再放入初始化说明。工具描述及参数 schema 通过
`tools/list` 提供，与原 agent 的工具声明分开传递方式对应。

## 与 Pi 一致的内容加载

`src/context.ts` 直接调用固定版本 `@earendil-works/pi-coding-agent@1.0.4` 的：

- `loadSkills`：只扫描本项目 `skills/`，`includeDefaults:false`，使用与
  Strategy Forge 相同的技能路径和真实路径过滤。不发现用户目录或工作区中的
  ambient Pi 编码技能、扩展或上下文文件。
- `formatSkillsForPrompt(skills, 'indirect')`：生成相同 XML 索引，包含名称、描述、
  绝对文件路径。正文不提前塞入常驻上下文。
- `stripFrontmatter`：显式调用时去除 frontmatter，使用与 Pi
  `AgentSession._expandSkillCommand` 相同的正文、引用目录标记、空白及附加指令格式。

Pi 负责 frontmatter 解析、忽略文件、目录发现、名字冲突及诊断。
`disable-model-invocation:true` 的技能保留在发现结果中，但不进入自动技能索引；
可由用户显式调用。资源列表也遵循这一自动可见性规则。

当前移植了两个技能及其全部引用文件：

- `balatro-wiki-rules`
- `balatro-gold-stake-coach`

`skills/README.md` 是原 Pi agent 的操作说明，保留原文。其中的 `file_read`、
`file_write` 和 Pi CLI 命令描述原运行时；MCP 的对应方式见下文。
Wiki 技能中的来源、署名和许可说明均已保留。

## MCP 读取方式

| 入口 | 内容 |
| --- | --- |
| 初始化 `instructions` | 简短操作约定及资源入口 |
| `balatro://context` | 完整规则、协议、技能索引与绑定说明 |
| `balatro://rules` | 原 `balatro.md` 全文 |
| `balatro://protocol` | 原 `skills/core.md` 全文 |
| `balatro://skills` | Pi 元数据、XML 索引、技能资源 URI、发现诊断 |
| 技能文件的 `file://` URI | 原技能正文或引用文件全文 |
| `skill:<name>` MCP prompt | Pi 风格的显式技能展开，可带 `instructions` 参数 |

例如先读取 `balatro://skills`，取其中 `balatro-gold-stake-coach` 的 `uri`，
通过 MCP `resources/read` 读取技能文件。正文引用 `references/decision-tables.md`
时，以该技能目录为基准解析路径，再转换为文件 URI 读取。

显式 prompt 示例为 `skill:balatro-gold-stake-coach`，参数
`{"instructions":"检查当前局面的风险，先不要操作游戏。"}`。
它只返回展开后的上下文，不会自己启动游戏、调用工具或提交模型请求。

资源只允许读取已发现技能目录中的普通文件，并检查真实路径；目录、隐藏文件、
目录外文件和指向目录外的链接会被拒绝。资源完整返回原文，保留按需读取时的
frontmatter；显式 prompt 才按 Pi 的规则去除 frontmatter。

`file_read` 和 `file_write` 工具没有恢复。Pi coding-agent 依赖用于复用技能加载
函数，不创建 Pi agent/session，也不注册它的文件、Shell 或其他工具。
等待、暂停、上下文压缩与恢复由 MCP 宿主控制；原文中的 `/resume` 对应宿主的
会话操作。技能内容不能授予工具权限，也不能单独授权开始或继续游戏。

## 客户端与刷新

服务端发送简短 `instructions`，具体如何纳入模型上下文由 MCP 客户端决定。
需要客户端支持初始化说明和资源读取；不自动采用说明的客户端可以读取
`balatro://context` 后纳入对话。

发现结果与索引在服务启动时建立。修改技能后重启服务刷新，和原 Pi agent 在新建
会话或重启终端时重新发现技能的方式一致。正文和引用在请求时读取。

## 验证

测试将发现结果和 XML 索引与 Pi 原函数逐项比较，并覆盖简短初始化、完整参考资源、超过旧长度上限
的内容、忽略文件、重名诊断、仅手动调用技能、环境技能隔离、正文及引用按需读取、
显式展开、带空格路径及资源边界。真实 stdio 测试确认初始化不再重复完整上下文，
工具仍为 8 个，文件工具不可调用。

构建和类型检查由项目测试命令验证。Lua 决策状态回归可在项目根目录执行
`luajit tests/decision.test.lua`（亦兼容 Lua 5.1）；覆盖动态 Boss、历史完整性、
跳盲奖励、解锁信息、readiness 原因及只读边界。
原移植文件的来源与当时的哈希记录在 `docs/PROVENANCE.json`；接口适配代码已在本次重写中更新。
