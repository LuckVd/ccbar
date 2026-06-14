# ccbar

> Claude Code Status Bar — 实时显示会话信息、Token 消耗、花费与 Git 状态

## 简介

ccbar 是一个为 Claude Code CLI 设计的状态栏工具，通过解析 transcript 文件实时显示会话相关信息。内置 Claude 官方模型的定价与上下文窗口，开箱即用；同时支持通过配置文件自定义任意模型（如 GLM 等）的定价与上下文窗口。

## 功能特性

- **📊 Token 统计** — 直接解析 transcript 文件显示准确的 Token 累计（输入、输出、缓存）
- **💰 花费计算** — 基于定价配置自动计算花费，支持多币种（USD/CNY）
- **🧠 上下文使用率** — 实时显示上下文窗口使用百分比，动态颜色警示，带缓存防止闪烁
- **🌿 Git 状态** — 显示分支、脏状态、代码变更（含未跟踪文件）、远程同步状态
- **⏱ 会话耗时** — 显示当前会话活跃时长（排除空闲间隔）
- **📁 目录显示** — 当前工作目录（git 根目录）名称
- **🤖 模型识别** — 自动解析并显示实际使用的模型
- **💾 跨会话累计** — Token / 花费 / 耗时跨 `/clear` 持久化，按 git 项目隔离
- **⚙️ 可配置** — 通过配置文件控制显示字段、定价和上下文窗口

## 显示效果

```
D: myapp | G: main | ≡ | +12 -3 | ⏱ 1h 5m | 47.3K/200K(23.6%) | M: Sonnet 4.6 | T: 1.24M | $: 2.81
```

**显示顺序：**

| 字段 | 说明 | 颜色 |
|------|------|------|
| `D:` | 目录名 | 青色 |
| `G:` | Git 分支 | 粉红色（脏状态红色） |
| `≡` | 远程状态（同步） | 青色 |
| `↑2 ↓1` | 远程状态（领先/落后） | 青色 |
| `+12` | 新增行数 | 绿色 |
| `-3` | 删除行数 | 亮红色 |
| `⏱ 1h 5m` | 会话耗时 | 白色 |
| `47.3K/200K(23.6%)` | 上下文使用 | 动态颜色 |
| `M:` | 模型名 | 蓝色 |
| `T:` | 累计 Token | 紫红色 |
| `$:` / `¥:` | 花费 | 亮绿色 |

**上下文颜色：**
- `< 50%` 🟢 绿色
- `50% - 80%` 🟡 黄色
- `> 80%` 🔴 红色

## 安装

### 方式一：npm（推荐）

```bash
npm install -g @luckvd/ccbar
```

安装后在 `~/.claude/settings.json` 配置：

```json
{
  "statusLine": {
    "type": "command",
    "command": "ccbar",
    "padding": 0
  }
}
```

### 方式二：git clone

```bash
git clone https://github.com/LuckVd/ccbar.git
cd ccbar
chmod +x src/token-accumulator.cjs
```

配置时 `command` 使用脚本绝对路径：`/path/to/ccbar/src/token-accumulator.cjs`。

## 配置

### 1. 状态栏配置（必需）

在 `~/.claude/settings.json` 中添加 `statusLine`（见上方安装小节）。npm 安装时 `command` 写 `ccbar`，git clone 时写脚本绝对路径。

### 2. 模型定价（可选）

ccbar 已内置 Claude 官方模型的定价（USD）。若要覆盖或添加其他模型，在 `~/.claude/settings.json` 添加 `modelPricing`：

```json
{
  "modelPricing": {
    "claude-opus-4-8": { "input": 15, "output": 75, "cache": 1.5, "currency": "USD" },
    "claude-sonnet-4-6": { "input": 3, "output": 15, "cache": 0.3, "currency": "USD" },
    "claude-haiku-4-5": { "input": 1, "output": 5, "cache": 0.1, "currency": "USD" }
  }
}
```

**定价格式说明：**
- `input` / `output` / `cache`：每百万 Token 的价格
- `currency`：货币单位（`"USD"` 显示 `$`，`"CNY"` 显示 `¥`）
- `cache` 使用缓存读取价；缓存写入计费更高，因此花费可能略偏低

### 3. 上下文窗口（可选）

ccbar 已内置 Claude 模型 200K 上下文窗口。若要覆盖，在 `~/.claude/settings.json` 添加 `modelContextWindow`：

```json
{
  "modelContextWindow": {
    "claude-opus-4-8": 200000,
    "claude-sonnet-4-6": 200000
  }
}
```

### 4. 显示字段配置（可选）

创建 `~/.claude/ccbar/config.json` 控制显示哪些字段：

```json
{
  "fields": {
    "dir": true,
    "git": true,
    "remote": true,
    "changes": true,
    "duration": true,
    "context": true,
    "model": true,
    "token": true,
    "cost": true
  },
  "separator": " | "
}
```

## 命令行使用

```bash
ccbar                  # 自动从 stdin 读取（Claude Code 调用方式）
ccbar --help           # 查看帮助
ccbar --version        # 查看版本
ccbar --reset-tokens   # 重置当前项目的 Token/花费/耗时历史
ccbar --reset-all-tokens  # 重置所有项目的历史
ccbar --show-history   # 查看所有项目的历史
ccbar /path/to/transcript.jsonl  # 指定 transcript 文件
```

通过 stdin 输入：

```bash
echo '{"transcript_path":"/path/to/transcript.jsonl"}' | ccbar
```

## 使用其他 Provider（如智谱 GLM）

ccbar 默认面向 Claude 官方模型。如果你通过 Anthropic 兼容接口使用 GLM 等其他模型，只需在 `~/.claude/settings.json` 补充该模型的定价与上下文窗口，ccbar 即可正确计算：

```json
{
  "modelContextWindow": {
    "glm-5.2": 1000000,
    "glm-4.7": 200000
  },
  "modelPricing": {
    "glm-5.2": { "input": 4, "output": 18, "cache": 1, "currency": "CNY" },
    "glm-4.7": { "input": 3, "output": 14, "cache": 0.6, "currency": "CNY" }
  }
}
```

> 注：Claude Code 的 `settings.json` 写入校验会拒绝 `modelContextWindow` / `modelPricing` 等非官方字段。直接用编辑器或命令行写入即可，运行时会正常加载。

## 工作原理

1. **Token 统计** — 解析 transcript，按行增量累计所有消息的 Token 用量
2. **花费计算** — 根据各模型定价累加花费，支持多模型混合
3. **上下文窗口** — 取最后一条 assistant 消息的输入 Token（含缓存读取）计算使用率，带缓存防闪烁
4. **Git 状态** — 通过 git 命令获取分支、变更、远程状态
5. **跨会话累计** — Token/花费/耗时写入 `~/.claude/ccbar/token-history.json`，按 git 根目录隔离项目

## 依赖

- Node.js >= 14
- Git（获取分支和变更信息）
- Claude Code（提供 transcript 数据）

## 注意事项

- 上下文信息使用文件缓存，进程重启后保留上次值，避免刷新闪烁
- 花费基于定价配置估算，请按你的实际 API 价格配置以获得准确结果
- Token 统计包含输入、输出、缓存读取、缓存创建
- 代码变更统计包括工作区变更、暂存区变更和未跟踪文件

## License

MIT
