#!/usr/bin/env node
/**
 * Enhanced StatusLine for Claude Code
 *
 * Inspired by CCometixLine, displays:
 *   Directory name with icon
 *   Git branch with status icon
 *   Context window remaining with icon
 *   Model name
 *   Total session tokens (2 decimal places) with icon
 *
 * Usage:
 *   - As statusLine command in Claude Code settings.json
 *   - Direct execution with transcript path argument
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

/**
 * Load configuration from file
 * Config location: ~/.claude/ccbar/config.json
 */
function loadConfig() {
  const configPath = path.join(os.homedir(), '.claude', 'ccbar', 'config.json');

  // Default configuration (all fields enabled)
  const defaultConfig = {
    fields: {
      dir: true,
      git: true,
      remote: true,
      changes: true,
      duration: true,
      context: true,
      model: true,
      token: true,
      cost: true,
    },
    separator: ' | ',
  };

  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { ...defaultConfig, ...userConfig };
  }
  catch {
    return defaultConfig;
  }
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

// Color configuration
const colorConfig = {
  dir: colors.cyan,
  git: colors.brightMagenta,
  context: colors.yellow,
  model: colors.blue,
  token: colors.magenta,
  cost: colors.brightGreen,
  label: colors.bright,
};

// Icons with spacing (ASCII only)
const ICONS = {
  dir: 'D:',
  git: 'G:',
  gitClean: '',
  gitDirty: '*',
  context: '',
  token: 'T:',
  separator: ' | ',
};

/**
 * Get stdin JSON input from Claude Code
 */
function getStdinInput() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8');
    if (!stdin.trim()) {
      return null;
    }
    return JSON.parse(stdin);
  }
  catch {
    return null;
  }
}

/**
 * Get current directory name
 */
function getDirName(input) {
  const cwd = input?.workspace?.current_dir || process.cwd();
  return path.basename(cwd);
}

/**
 * Get session duration from transcript timestamps
 */
function getSessionDuration(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return null;
    }

    let firstTime = null;
    let lastTime = null;

    // Get first timestamp
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) {
          firstTime = new Date(entry.timestamp);
          break;
        }
      }
      catch {
        continue;
      }
    }

    // Get last timestamp
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.timestamp) {
          lastTime = new Date(entry.timestamp);
          break;
        }
      }
      catch {
        continue;
      }
    }

    if (!firstTime || !lastTime) {
      return null;
    }

    const diffMs = lastTime - firstTime;
    const diffSeconds = diffMs / 1000;
    const diffMinutes = diffSeconds / 60;
    const diffHours = diffMinutes / 60;

    // Format: 2h 15m or 45m or 30s
    if (diffHours >= 1) {
      const h = Math.floor(diffHours);
      const m = Math.floor(diffMinutes % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    else if (diffMinutes >= 1) {
      return `${Math.floor(diffMinutes)}m`;
    }
    else {
      return `${Math.floor(diffSeconds)}s`;
    }
  }
  catch {
    return null;
  }
}

/**
 * Get git file changes (added/removed lines)
 */
function getGitChanges() {
  try {
    // Get working directory changes
    const working = execSync('git diff --numstat', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    // Get staged changes
    const staged = execSync('git diff --cached --numstat', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    let added = 0;
    let removed = 0;

    // Parse working directory changes
    for (const line of working.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 2) {
        added += parseInt(parts[0]) || 0;
        removed += parseInt(parts[1]) || 0;
      }
    }

    // Parse staged changes
    for (const line of staged.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 2) {
        added += parseInt(parts[0]) || 0;
        removed += parseInt(parts[1]) || 0;
      }
    }

    // Always show changes, even if zero
    // Return object with separate parts for coloring
    const formatNum = (num) => {
      if (num >= 1000) return `+${(num / 1000).toFixed(1)}K`;
      return `+${num}`;
    };
    const formatRemoved = (num) => {
      if (num >= 1000) return `-${(num / 1000).toFixed(1)}K`;
      return `-${num}`;
    };

    return {
      added: formatNum(added),
      removed: formatRemoved(removed),
    };
  }
  catch {
    return { added: '+0', removed: '-0' };
  }
}

/**
 * Get git remote status (ahead/behind)
 * Always returns status, shows ≡ when synced
 */
function getGitRemoteStatus() {
  try {
    const result = execSync('git rev-list --left-right --count HEAD...@{u}', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    const parts = result.split('\t');
    if (parts.length !== 2) {
      return '≡';
    }

    const ahead = parseInt(parts[1]) || 0;
    const behind = parseInt(parts[0]) || 0;

    if (ahead === 0 && behind === 0) {
      return '≡';
    }

    const status = [];
    if (ahead > 0) status.push(`↑${ahead}`);
    if (behind > 0) status.push(`↓${behind}`);

    return status.join(' ');
  }
  catch {
    return '≡';
  }
}

/**
 * Get git branch and status
 */
function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (branch === 'HEAD') {
      return { branch: '(detached)', dirty: false };
    }

    try {
      execSync('git diff --quiet && git diff --cached --quiet', {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return { branch, dirty: false };
    }
    catch {
      return { branch, dirty: true };
    }
  }
  catch {
    return { branch: '', dirty: false };
  }
}

/**
 * Get context window usage from transcript
 * Calculates the input tokens from the last assistant message (including cache)
 * Returns: { text: "usedK / maxK (percentage%)", percentage: number }
 */
function getContextWindowUsage(transcriptPath, modelId) {
  if (!fs.existsSync(transcriptPath)) {
    return { text: '', percentage: 0 };
  }

  const contextWindows = {
    'glm-4.7': 128000,
    'glm-5': 200000,
    'glm-5.1': 200000,
    'claude-3-5-sonnet': 200000,
    'claude-3-5-opus': 200000,
    'claude-3-haiku': 200000,
  };

  const maxTokens = contextWindows[modelId] || 200000;

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    let lastInputTokens = 0;

    // Find the last assistant message with usage data
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message?.usage) {
          const usage = entry.message.usage;
          // Total input includes actual input + cache read
          lastInputTokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
        }
      }
      catch {
        continue;
      }
    }

    const percentage = parseFloat(((lastInputTokens / maxTokens) * 100).toFixed(1));

    // Format tokens
    const formatUsed = lastInputTokens >= 1000 ? `${(lastInputTokens / 1000).toFixed(1)}K` : `${lastInputTokens}`;
    const formatMax = maxTokens >= 1000 ? `${(maxTokens / 1000).toFixed(0)}K` : `${maxTokens}`;

    return {
      text: `${formatUsed}/${formatMax}(${percentage.toFixed(1)}%)`,
      percentage,
    };
  }
  catch {
    return { text: '', percentage: 0 };
  }
}

/**
 * Calculate total session tokens
 * Includes: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
 */
function calculateTotalTokens(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) {
    return 0;
  }

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  let total = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const usage = entry.message?.usage || entry.usage;

      if (usage) {
        const input = (usage.input_tokens || 0)
          + (usage.cache_read_input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0);
        const output = usage.output_tokens || 0;
        total += input + output;
      }
    }
    catch {
      continue;
    }
  }

  return total;
}

/**
 * Calculate cost from token usage
 * Simple pricing model (USD per million tokens)
 */
function calculateCost(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) {
    return null;
  }

  // Pricing per million tokens (adjust as needed)
  const pricing = {
    'glm-4.7': { input: 0.15, output: 0.60, cache: 0.015 },
    'glm-5': { input: 0.20, output: 0.80, cache: 0.02 },
    'glm-5.1': { input: 0.20, output: 0.80, cache: 0.02 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00, cache: 0.30 },
    'claude-3-5-opus': { input: 15.00, output: 75.00, cache: 1.50 },
    'claude-3-haiku': { input: 0.25, output: 1.25, cache: 0.03 },
  };

  const defaultPricing = { input: 1.00, output: 5.00, cache: 0.10 };

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheCreation = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const usage = entry.message?.usage || entry.usage;

        if (usage) {
          totalInput += usage.input_tokens || 0;
          totalOutput += usage.output_tokens || 0;
          totalCacheRead += usage.cache_read_input_tokens || 0;
          totalCacheCreation += usage.cache_creation_input_tokens || 0;
        }
      }
      catch {
        continue;
      }
    }

    // Detect model from transcript
    let modelId = 'glm-5.1';
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.model && typeof entry.model === 'string') {
          modelId = entry.model;
          break;
        }
        if (entry.message?.model) {
          modelId = entry.message.model;
          break;
        }
      }
      catch {
        continue;
      }
    }

    const price = pricing[modelId] || defaultPricing;

    // Calculate cost (USD)
    const cost = (totalInput * price.input / 1_000_000)
      + (totalOutput * price.output / 1_000_000)
      + (totalCacheRead * price.cache / 1_000_000)
      + (totalCacheCreation * price.cache / 1_000_000);

    return cost;
  }
  catch {
    return null;
  }
}

/**
 * Format tokens to millions (2 decimal places)
 */
function formatTokens(tokens) {
  if (tokens === 0) {
    return '0.00M';
  }
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/**
 * Get simplified model name with icon
 * Also reads settings.json to resolve model aliases like --opus
 */
function getModelDisplay(modelId, input) {
  // Model alias mapping from command line args to actual models
  const aliasMap = {
    '--opus': 'glm-5.1',
    '--sonnet': 'glm-5',
    '--haiku': 'glm-4.5-air',
  };

  // Try to get actual model from input's model.display_name
  if (input?.model?.display_name) {
    modelId = input.model.display_name;
  }

  // Resolve alias
  const actualModel = aliasMap[modelId] || modelId;

  const modelMap = {
    'glm-4.7': 'GLM-4.7',
    'glm-5': 'GLM-5',
    'glm-5.1': 'GLM-5.1',
    'glm-4.5-air': 'GLM-4.5',
    'claude-3-5-sonnet': 'S3.5',
    'claude-3-5-opus': 'O3.5',
    'claude-3-haiku': 'H3',
  };
  return modelMap[actualModel] || actualModel;
}

/**
 * Build statusline output with configurable fields
 */
function buildStatusLine(input) {
  const config = loadConfig();
  const parts = [];
  const transcriptPath = input?.transcript_path;

  // 1. Directory
  if (config.fields.dir) {
    const dirName = getDirName(input);
    if (dirName) {
      parts.push(`${colorConfig.dir}${ICONS.dir} ${dirName}${colors.reset}`);
    }
  }

  // 2. Git branch
  if (config.fields.git) {
    const gitInfo = getGitInfo();
    if (gitInfo.branch) {
      const statusIcon = gitInfo.dirty ? ICONS.gitDirty : ICONS.gitClean;
      const branchColor = gitInfo.dirty ? colors.brightRed : colorConfig.git;
      parts.push(`${branchColor}${ICONS.git} ${gitInfo.branch}${statusIcon}${colors.reset}`);
    }
  }

  // 3. Git remote status
  if (config.fields.remote) {
    const remoteStatus = getGitRemoteStatus();
    parts.push(`${colors.cyan}${remoteStatus}${colors.reset}`);
  }

  // 4. Code changes
  if (config.fields.changes) {
    const changes = getGitChanges();
    parts.push(`${colors.green}${changes.added}${colors.reset} ${colors.red}${changes.removed}${colors.reset}`);
  }

  // 5. Session duration
  if (config.fields.duration && transcriptPath) {
    const duration = getSessionDuration(transcriptPath);
    if (duration) {
      parts.push(`${colors.brightWhite}⏱${colors.reset} ${duration}`);
    }
  }

  // 6. Context window usage
  if (config.fields.context && transcriptPath) {
    const modelId = input?.model?.id || 'glm-4.7';
    const contextInfo = getContextWindowUsage(transcriptPath, modelId);
    if (contextInfo.text) {
      let contextColor;
      if (contextInfo.percentage < 50) {
        contextColor = colors.green;
      }
      else if (contextInfo.percentage < 80) {
        contextColor = colors.yellow;
      }
      else {
        contextColor = colors.red;
      }
      parts.push(`${contextColor}${contextInfo.text}${colors.reset}`);
    }
  }

  // 7. Model name
  if (config.fields.model && transcriptPath) {
    const modelId = input?.model?.id || 'glm-4.7';
    const modelDisplay = getModelDisplay(modelId, input);
    if (modelDisplay) {
      parts.push(`M: ${modelDisplay}`);
    }
  }

  // 8. Total session tokens
  if (config.fields.token && transcriptPath) {
    const totalTokens = calculateTotalTokens(transcriptPath);
    parts.push(`${colorConfig.label}T:${colors.reset} ${colorConfig.token}${formatTokens(totalTokens)}${colors.reset}`);
  }

  // 9. Cost
  if (config.fields.cost && transcriptPath) {
    let cost = null;
    if (input?.cost?.usd !== undefined) {
      cost = input.cost.usd;
    }
    else {
      cost = calculateCost(transcriptPath);
    }

    if (cost !== null && !isNaN(cost) && cost > 0) {
      const costStr = cost.toFixed(2);
      parts.push(`${colorConfig.label}$:${colors.reset} ${colorConfig.cost}${costStr}${colors.reset}`);
    }
  }

  return parts.join(config.separator);
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Enhanced StatusLine for Claude Code v2.0.0

USAGE:
  token-accumulator [transcript-path]

DISPLAY FORMAT:
  📁dir branch|status 🪟context 🤖model 💰tokens

  - dir: Current directory name
  - branch: Git branch with status (* if dirty)
  - context: Remaining context window (e.g., 128K)
  - model: Model name with icon
  - 💰tokens: Total session tokens in millions (2 decimals)

EXAMPLE OUTPUT:
  📁zcf main* 🪟128K 🤖GLM-4.7 💰0.37M

STATUSLINE CONFIG:
  Add to ~/.claude/settings.json:
  {
    "statusLine": {
      "type": "command",
      "command": "/opt/projects/tmp/claude-token-accumulator/src/token-accumulator.cjs",
      "padding": 0
    }
  }
`);
    process.exit(0);
  }

  const input = getStdinInput();
  let transcriptPath = input?.transcript_path;

  if (!transcriptPath && args[0] && !args[0].startsWith('-')) {
    transcriptPath = args[0];
  }

  const output = input
    ? buildStatusLine(input)
    : buildStatusLine({ transcript_path: transcriptPath });

  console.log(output);
}

main();
