# ccbar

> Claude Code Status Bar - 实时显示会话信息、Token 消耗和 Git 状态

## 简介

ccbar 是一个为 Claude Code CLI 设计的状态栏工具，通过解析 transcript 文件实时显示会话相关信息。支持从配置文件读取模型定价和上下文窗口大小。

## 功能特性

- **📊 Token 统计** - 直接解析 transcript 文件显示准确的 Token 累计（包含输入、输出、缓存）
- **💰 花费计算** - 基于配置文件的定价自动计算花费，支持多币种（CNY/USD）
- **🧠 上下文使用率** - 实时显示上下文窗口使用百分比，动态颜色警示，支持缓存防止闪烁
- **🌿 Git 状态** - 显示分支、脏状态、代码变更（含未跟踪文件）、远程同步状态
- **⏱ 会话耗时** - 显示当前会话持续时间
- **📁 目录显示** - 当前工作目录名称
- **🤖 模型识别** - 自动解析并显示实际使用的模型
- **⚙️ 可配置** - 通过配置文件控制显示字段、定价和上下文窗口

## 显示效果

```
D: ccbar | G: main* | ≡ | +245 -69 | ⏱ 2h 6m | 94.7K/200K(47.4%) | M: GLM-4.7 | T: 49.88M | ¥: 32.93
```

**显示顺序：**

| 字段 | 说明 | 颜色 |
|------|------|------|
| `D:` | 目录名 | 青色 |
| `G:` | Git 分支 | 粉红色（脏状态红色） |
| `≡` | 远程状态（同步） | 青色 |
| `↑2 ↓1` | 远程状态（领先/落后） | 青色 |
| `+245` | 新增行数 | 绿色 |
| `-69` | 删除行数 | 红色 |
| `⏱ 2h 6m` | 会话耗时 | 白色 |
| `94.7K/200K(47.4%)` | 上下文使用 | 动态颜色 |
| `M:` | 模型名 | 蓝色 |
| `T:` | 累计 Token | 紫红色 |
| `¥:` / `$:` | 花费 | 亮绿色 |

**上下文颜色：**
- `< 50%` 🟢 绿色
- `50% - 80%` 🟡 黄色
- `> 80%` 🔴 红色

## 安装

```bash
# 克隆项目
git clone https://github.com/LuckVd/ccbar.git
cd ccbar

# 添加执行权限
chmod +x src/token-accumulator.cjs
```

## 配置

### 1. 状态栏配置

在 `~/.claude/settings.json` 中添加：

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/ccbar/src/token-accumulator.cjs",
    "padding": 0
  }
}
```

### 2. 模型定价配置（可选）

在 `~/.claude/settings.json` 中添加 `modelPricing` 来自定义各模型的定价：

```json
{
  "modelPricing": {
    "glm-5": {
      "input": 4,
      "output": 18,
      "cache": 1,
      "currency": "CNY"
    },
    "glm-5.1": {
      "input": 4,
      "output": 18,
      "cache": 1,
      "currency": "CNY"
    },
    "glm-4.7": {
      "input": 3,
      "output": 14,
      "cache": 0.6,
      "currency": "CNY"
    },
    "glm-4.5-air": {
      "input": 0.8,
      "output": 6,
      "cache": 0.16,
      "currency": "CNY"
    },
    "claude-3-5-sonnet": {
      "input": 3.00,
      "output": 15.00,
      "cache": 0.30,
      "currency": "USD"
    }
  }
}
```

**定价格式说明：**
- `input`: 输入价格（每百万 Token）
- `output`: 输出价格（每百万 Token）
- `cache`: 缓存价格（每百万 Token）
- `currency`: 货币单位（`"CNY"` 显示 ¥，`"USD"` 显示 $）

### 3. 上下文窗口配置（可选）

在 `~/.claude/settings.json` 中添加 `modelContextWindow` 来自定义上下文窗口大小：

```json
{
  "modelContextWindow": {
    "glm-4.7": 200000,
    "glm-5": 200000,
    "glm-5.1": 200000,
    "glm-4.5-air": 128000,
    "claude-3-5-sonnet": 200000
  }
}
```

### 4. 显示字段配置（可选）

创建 `~/.claude/ccbar/config.json` 来控制显示哪些字段：

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

### 完整配置示例

`~/.claude/settings.json` 完整示例：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-token",
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.1",
    "CLAUDE_MODEL_MAX_TOKENS": "200000"
  },
  "model": "--opus",
  "statusLine": {
    "type": "command",
    "command": "/path/to/ccbar/src/token-accumulator.cjs",
    "padding": 0
  },
  "modelContextWindow": {
    "glm-4.7": 200000,
    "glm-5": 200000,
    "glm-5.1": 200000,
    "glm-4.5-air": 128000
  },
  "modelPricing": {
    "glm-5": {
      "input": 4,
      "output": 18,
      "cache": 1,
      "currency": "CNY"
    },
    "glm-5.1": {
      "input": 4,
      "output": 18,
      "cache": 1,
      "currency": "CNY"
    },
    "glm-4.7": {
      "input": 3,
      "output": 14,
      "cache": 0.6,
      "currency": "CNY"
    },
    "glm-4.5-air": {
      "input": 0.8,
      "output": 6,
      "cache": 0.16,
      "currency": "CNY"
    }
  }
}
```

## 使用方法

### 作为 Claude Code 状态栏

配置完成后，Claude Code 每次状态更新时会自动调用 ccbar。

### 命令行使用

```bash
# 自动检测当前会话
./src/token-accumulator.cjs

# 指定 transcript 文件
./src/token-accumulator.cjs /path/to/transcript.jsonl

# 查看帮助
./src/token-accumulator.cjs --help
```

### 通过 stdin 输入

```bash
echo '{"transcript_path":"/path/to/transcript.jsonl"}' | ./src/token-accumulator.cjs
```

## 工作原理

1. **Token 统计**: 直接解析 transcript 文件，统计所有消息的 Token 使用量
2. **花费计算**: 根据配置文件中的定价计算总花费
3. **上下文窗口**: 从配置读取各模型的上下文窗口大小，计算使用率并缓存结果防止闪烁
4. **Git 状态**: 通过 git 命令获取分支、变更、远程状态等信息

## 依赖

- Node.js (用于运行脚本)
- Git (用于获取分支和变更信息)
- Claude Code (提供 transcript 数据)

## 注意事项

- 上下文信息使用文件缓存，进程重启后仍保留上次值，避免刷新时闪烁
- 花费计算基于配置文件的定价，请根据实际 API 提供商的价格进行配置
- Token 统计包含所有类型（输入、输出、缓存读取、缓存创建）
- 代码变更统计包括工作区变更、暂存区变更和未跟踪文件

## License

MIT

## 相关项目

- [ZCF](https://github.com/your-repo/zcf) - Zero-Config Code Flow
- [CCometixLine](https://github.com/Haleclipse/CCometixLine) - 状态栏灵感来源
