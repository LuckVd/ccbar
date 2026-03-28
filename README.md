# ccbar

> Claude Code Status Bar - 实时显示会话信息、Token 消耗和 Git 状态

## 简介

ccbar 是一个为 Claude Code CLI 设计的状态栏工具，通过解析 transcript 文件实时显示会话相关信息。

## 功能特性

- **📊 Token 统计** - 显示当前会话累计 Token（包含输入、输出、缓存）
- **💰 花费计算** - 基于 Token 使用量自动计算花费（支持 GLM/Claude 模型定价）
- **🧠 上下文使用率** - 实时显示上下文窗口使用百分比，动态颜色警示
- **🌿 Git 状态** - 显示分支、脏状态、代码变更、远程同步状态
- **📁 目录显示** - 当前工作目录名称
- **🤖 模型识别** - 自动解析并显示实际使用的模型

## 显示效果

```
D: zcf | G: main | +12 -5 | ↑2 ↓1 | 147.8K/200K(73.9%) | M: GLM-5.1 | T: 30.78M | $: 0.56
```

**显示顺序：**

| 字段 | 说明 | 颜色 |
|------|------|------|
| `D:` | 目录名 | 青色 |
| `G:` | Git 分支 | 粉红色（脏状态红色） |
| `+12 -5` | 代码变更 | 绿色 |
| `↑2 ↓1` | 远程状态 | 青色 |
| `147.8K/200K(73.9%)` | 上下文使用 | 黄色（动态） |
| `M:` | 模型名 | 标签亮色/名称蓝色 |
| `T:` | 累计 Token | 标签亮色/数值紫红色 |
| `$:` | 花费 | 标签亮色/数值亮绿色 |

**上下文颜色：**
- `< 50%` 🟢 绿色
- `50% - 80%` 🟡 黄色
- `> 80%` 🔴 红色

## 安装

```bash
# 克隆或下载项目
git clone <repo-url>
cd ccbar

# 或直接使用
chmod +x src/token-accumulator.cjs
```

## 配置

将以下配置添加到 `~/.claude/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/ccbar/src/token-accumulator.cjs",
    "padding": 0
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

## 模型定价

内置模型定价（美元/百万 Token）：

| 模型 | 输入 | 输出 | 缓存 |
|------|------|------|------|
| GLM-4.7 | $0.15 | $0.60 | $0.015 |
| GLM-5 | $0.20 | $0.80 | $0.02 |
| GLM-5.1 | $0.20 | $0.80 | $0.02 |
| Claude 3.5 Sonnet | $3.00 | $15.00 | $0.30 |
| Claude 3.5 Opus | $15.00 | $75.00 | $1.50 |
| Claude 3 Haiku | $0.25 | $1.25 | $0.03 |

如需修改定价，编辑 `src/token-accumulator.cjs` 中的 `pricing` 对象。

## 依赖

- Node.js (用于运行脚本)
- Git (用于获取分支和变更信息)
- Claude Code (提供 transcript 数据)

## 开发

```bash
# 运行
node src/token-accumulator.cjs

# 测试
echo '{"transcript_path":"test.jsonl"}' | node src/token-accumulator.cjs
```

## 注意事项

- 代码变更和远程状态仅在实际有变更时显示
- 花费计算基于内置定价，实际费用可能因 API 提供商不同而有所差异
- Token 统计包含所有类型（输入、输出、缓存读取、缓存创建）

## License

MIT

## 相关项目

- [ZCF](https://github.com/your-repo/zcf) - Zero-Config Code Flow
- [CCometixLine](https://github.com/Haleclipse/CCometixLine) - 状态栏灵感来源
- [ccusage](https://github.com/kx-ai/ccusage) - Token 使用统计工具
