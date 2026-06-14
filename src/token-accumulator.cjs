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

// Read version from package.json (parent of src/)
const PACKAGE_VERSION = (() => {
  try {
    return require(path.join(__dirname, '..', 'package.json')).version;
  }
  catch {
    return '0.0.0';
  }
})();

// Cache directory for persisting data between invocations
const CACHE_DIR = path.join(os.homedir(), '.claude', 'ccbar', 'cache');

// Token history file path for cross-session accumulation
const TOKEN_HISTORY_PATH = path.join(os.homedir(), '.claude', 'ccbar', 'token-history.json');

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get cache file path for a transcript
 */
function getCachePath(transcriptPath) {
  // Create a safe filename from transcript path
  const hash = Buffer.from(transcriptPath).toString('base64').replace(/[/+=]/g, '');
  return path.join(CACHE_DIR, `context_${hash}.json`);
}

/**
 * Load cached context info
 */
function loadContextCache(transcriptPath) {
  try {
    const cachePath = getCachePath(transcriptPath);
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(data);
    }
  }
  catch {
    // Ignore cache errors
  }
  return null;
}

/**
 * Save context info to cache
 */
function saveContextCache(transcriptPath, data) {
  try {
    ensureCacheDir();
    const cachePath = getCachePath(transcriptPath);
    fs.writeFileSync(cachePath, JSON.stringify(data), 'utf-8');
  }
  catch {
    // Ignore cache errors
  }
}

/**
 * Get token history file path, ensuring directory exists
 */
function getTokenHistoryPath() {
  const dir = path.dirname(TOKEN_HISTORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return TOKEN_HISTORY_PATH;
}

/**
 * Load token history for cross-session accumulation
 * Returns object with { projects: { projectPath: { totalTokens, totalCost, processedFiles, lastUpdated } } }
 */
function loadTokenHistory() {
  try {
    if (fs.existsSync(TOKEN_HISTORY_PATH)) {
      const data = fs.readFileSync(TOKEN_HISTORY_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      // Ensure projects object exists
      if (!parsed.projects) {
        parsed.projects = {};
      }
      return parsed;
    }
  }
  catch {
    // Ignore errors and return default
  }
  return { projects: {} };
}

/**
 * Save token history
 */
function saveTokenHistory(history) {
  try {
    const historyPath = getTokenHistoryPath();
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }
  catch {
    // Ignore errors
  }
}

/**
 * Get git repository root directory
 * Returns the root of the git repo, or current dir if not in a repo.
 * Cached per-directory within a single process invocation (statusline is short-lived,
 * but several functions call this for the same dir per refresh).
 */
const gitRootCache = new Map();
const gitRepoCache = new Map();

function getGitRoot(workspaceDir) {
  const dir = workspaceDir || process.cwd();
  if (gitRootCache.has(dir)) {
    return gitRootCache.get(dir);
  }
  let root;
  try {
    root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: dir,
    }).trim();
  }
  catch {
    root = dir;
  }
  gitRootCache.set(dir, root);
  return root;
}

/**
 * Check whether a directory is inside a git work tree.
 * Cached per-directory within a single process invocation.
 */
function isGitRepo(workspaceDir) {
  const dir = workspaceDir || process.cwd();
  if (gitRepoCache.has(dir)) {
    return gitRepoCache.get(dir);
  }
  let result;
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: dir,
    });
    result = true;
  }
  catch {
    result = false;
  }
  gitRepoCache.set(dir, result);
  return result;
}

/**
 * Get project key for token history isolation
 * Uses git repository root to unify data across subdirectories
 */
function getProjectKey(workspaceDir) {
  const dir = workspaceDir || process.cwd();
  return getGitRoot(dir);
}

/**
 * Get or create project entry in token history
 */
function getProjectEntry(history, projectKey) {
  if (!history.projects[projectKey]) {
    history.projects[projectKey] = {
      totalTokens: 0,
      totalCost: null,
      totalDurationMs: 0,
      processedFiles: {},
      lastUpdated: new Date().toISOString(),
    };
  }
  return history.projects[projectKey];
}

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

/**
 * Load Claude Code settings for model context windows
 * Config location: ~/.claude/settings.json
 */
function loadModelContextWindows() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  // Default context windows (fallback) — Claude models, 200K each
  const defaultContextWindows = {
    'claude-opus-4-8': 200000,
    'claude-opus-4-7': 200000,
    'claude-opus-4-6': 200000,
    'claude-sonnet-4-6': 200000,
    'claude-sonnet-4-5': 200000,
    'claude-haiku-4-5': 200000,
  };

  if (!fs.existsSync(settingsPath)) {
    return defaultContextWindows;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const modelContextWindow = settings.modelContextWindow || {};
    return { ...defaultContextWindows, ...modelContextWindow };
  }
  catch {
    return defaultContextWindows;
  }
}

/**
 * Load pricing from Claude Code settings
 * Pricing format per model: { input: price_per_million, output: price_per_million, cache: price_per_million, currency: "CNY"|"USD" }
 */
function loadPricing() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  // Default pricing (USD per million tokens) — Claude official pricing.
  // cache uses cache-read price; cache writes bill higher, so cost may run slightly low.
  const defaultPricing = {
    'claude-opus-4-8': { input: 15, output: 75, cache: 1.5, currency: 'USD' },
    'claude-opus-4-7': { input: 15, output: 75, cache: 1.5, currency: 'USD' },
    'claude-opus-4-6': { input: 15, output: 75, cache: 1.5, currency: 'USD' },
    'claude-sonnet-4-6': { input: 3, output: 15, cache: 0.3, currency: 'USD' },
    'claude-sonnet-4-5': { input: 3, output: 15, cache: 0.3, currency: 'USD' },
    'claude-haiku-4-5': { input: 1, output: 5, cache: 0.1, currency: 'USD' },
  };

  if (!fs.existsSync(settingsPath)) {
    return defaultPricing;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const modelPricing = settings.modelPricing || {};
    return { ...defaultPricing, ...modelPricing };
  }
  catch {
    return defaultPricing;
  }
}

/**
 * Strip provider suffix variants from a model id, e.g. "glm-5.2[1m]" -> "glm-5.2".
 */
function baseModelId(modelId) {
  return String(modelId).replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

/**
 * Look up a value in a model-keyed map by exact id, then by suffix-stripped base id.
 * Handles provider variants such as "glm-5.2[1m]" matching a configured "glm-5.2" entry.
 */
function lookupByModel(map, modelId) {
  if (map[modelId] !== undefined) {
    return map[modelId];
  }
  const base = baseModelId(modelId);
  if (base !== modelId && map[base] !== undefined) {
    return map[base];
  }
  // Case-insensitive fallback (display_name may differ in case from map keys)
  const lower = base.toLowerCase();
  for (const key of Object.keys(map)) {
    if (key.toLowerCase() === lower) {
      return map[key];
    }
  }
  return undefined;
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
 * Uses git root for consistency with project key
 */
function getDirName(input) {
  const cwd = input?.workspace?.current_dir || process.cwd();
  const gitRoot = getGitRoot(cwd);
  // Use git root basename for consistency with token/cost accumulation
  return path.basename(gitRoot);
}

/**
 * Get session duration from transcript timestamps with cross-session accumulation
 * Only counts active time between messages (gaps > 10 minutes are considered idle)
 */
function getSessionDuration(transcriptPath, workspaceDir) {
  if (!fs.existsSync(transcriptPath)) {
    return null;
  }

  const projectKey = getProjectKey(workspaceDir);
  const history = loadTokenHistory();
  const project = getProjectEntry(history, projectKey);

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return formatDuration(project.totalDurationMs || 0);
    }

    // Collect all timestamps
    const timestamps = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) {
          timestamps.push(new Date(entry.timestamp));
        }
      }
      catch {
        continue;
      }
    }

    if (timestamps.length < 2) {
      return formatDuration(project.totalDurationMs || 0);
    }

    // Sort timestamps
    timestamps.sort((a, b) => a - b);

    // Calculate active time: sum gaps between consecutive messages
    // Only count gaps <= 1 hour as active time
    const IDLE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

    let activeTimeMs = 0;
    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      if (gap <= IDLE_THRESHOLD_MS) {
        activeTimeMs += gap;
      }
    }

    // Also count the time from first to last message in each active block
    // Find continuous blocks of messages (where gaps <= threshold)
    let blockStart = timestamps[0];
    let blockEnd = timestamps[0];

    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      if (gap <= IDLE_THRESHOLD_MS) {
        // Still in active block
        blockEnd = timestamps[i];
      }
      else {
        // End of active block, add its duration
        activeTimeMs += (blockEnd - blockStart);
        // Start new block
        blockStart = timestamps[i];
        blockEnd = timestamps[i];
      }
    }
    // Add the last block
    activeTimeMs += (blockEnd - blockStart);

    // Round to seconds to avoid tiny fractions
    activeTimeMs = Math.round(activeTimeMs / 1000) * 1000;

    // Check if we've already calculated duration for this file
    const fileInfo = project.processedFiles[transcriptPath];

    // Check if file has grown since last duration calculation
    // Use lines from fileInfo (updated by calculateTotalTokens) or current file size
    const recordedLines = fileInfo?.lines || 0;
    const fileHasGrown = lines.length > recordedLines;

    // If this is a new file or duration has changed or file has grown, update history
    if (!fileInfo || fileInfo.durationMs !== activeTimeMs || fileHasGrown) {
      // Remove old duration if it existed
      const oldDuration = fileInfo?.durationMs || 0;

      // Recalculate total: previous total - old file duration + new file duration
      project.totalDurationMs = (project.totalDurationMs || 0) - oldDuration + activeTimeMs;

      // Update file info
      if (!project.processedFiles[transcriptPath]) {
        project.processedFiles[transcriptPath] = {};
      }
      project.processedFiles[transcriptPath].durationMs = activeTimeMs;
      // Don't update 'lines' here - let calculateTotalTokens handle it
      // to avoid race conditions where duration updates first
      project.lastUpdated = new Date().toISOString();

      saveTokenHistory(history);
    }

    return formatDuration(project.totalDurationMs || 0);
  }
  catch {
    return formatDuration(project.totalDurationMs || 0);
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms) {
  if (ms <= 0) {
    return null;
  }

  const diffSeconds = ms / 1000;
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

/**
 * Get git file changes (added/removed lines)
 */
function getGitChanges(workspaceDir) {
  try {
    // Get working directory changes
    const working = execSync('git diff --numstat', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: workspaceDir,
    }).trim();

    // Get staged changes
    const staged = execSync('git diff --cached --numstat', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: workspaceDir,
    }).trim();

    // Get untracked files count
    const untrackedResult = execSync('git ls-files --others --exclude-standard', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: workspaceDir,
    }).trim();
    const untrackedFiles = untrackedResult ? untrackedResult.split('\n').filter(f => f.trim()).length : 0;

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

    // Add untracked files as additions (estimate 1 line per file)
    added += untrackedFiles;

    // Always show changes, even if zero
    // Return colored strings directly
    const formatNum = (num) => {
      if (num >= 1000) return `${colors.green}+${(num / 1000).toFixed(1)}K${colors.reset}`;
      return `${colors.green}+${num}${colors.reset}`;
    };
    const formatRemoved = (num) => {
      // Use bright red for removed lines
      if (num >= 1000) return `${colors.brightRed}-${(num / 1000).toFixed(1)}K${colors.reset}`;
      return `${colors.brightRed}-${num}${colors.reset}`;
    };

    return `${formatNum(added)} ${formatRemoved(removed)}`;
  }
  catch {
    return `${colors.green}+0${colors.reset} ${colors.brightRed}-0${colors.reset}`;
  }
}

/**
 * Get git remote status (ahead/behind)
 * Always returns status, shows ≡ when synced
 */
function getGitRemoteStatus(workspaceDir) {
  try {
    const result = execSync('git rev-list --left-right --count HEAD...@{u}', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: workspaceDir,
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
function getGitInfo(workspaceDir) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: workspaceDir,
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

  const contextWindows = loadModelContextWindows();
  const maxTokens = lookupByModel(contextWindows, modelId) || 200000;

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    let lastInputTokens = 0;
    let foundUsage = false;

    // Find the last assistant message with usage data
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message?.usage) {
          const usage = entry.message.usage;
          // Total input includes actual input + cache read
          lastInputTokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
          foundUsage = true;
        }
      }
      catch {
        continue;
      }
    }

    // Return cached value if no usage data found yet
    if (!foundUsage || lastInputTokens === 0) {
      const cached = loadContextCache(transcriptPath);
      if (cached) {
        return cached;
      }
      return { text: '', percentage: 0 };
    }

    const percentage = parseFloat(((lastInputTokens / maxTokens) * 100).toFixed(1));

    // Format tokens
    const formatUsed = lastInputTokens >= 1000000 ? `${(lastInputTokens / 1000000).toFixed(2)}M` : lastInputTokens >= 1000 ? `${(lastInputTokens / 1000).toFixed(1)}K` : `${lastInputTokens}`;
    const formatMax = maxTokens >= 1000000 ? `${(maxTokens / 1000000).toFixed(0)}M` : maxTokens >= 1000 ? `${(maxTokens / 1000).toFixed(0)}K` : `${maxTokens}`;

    const result = {
      text: `${formatUsed}/${formatMax}(${percentage.toFixed(1)}%)`,
      percentage,
    };

    // Update cache
    saveContextCache(transcriptPath, result);

    return result;
  }
  catch {
    // Return cached value on error
    const cached = loadContextCache(transcriptPath);
    if (cached) {
      return cached;
    }
    return { text: '', percentage: 0 };
  }
}

/**
 * Calculate total session tokens with cross-session accumulation
 * Includes: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
 * Now persists across /clear commands
 */
function calculateTotalTokens(transcriptPath, workspaceDir) {
  if (!fs.existsSync(transcriptPath)) {
    return 0;
  }

  const projectKey = getProjectKey(workspaceDir);
  const history = loadTokenHistory();
  const project = getProjectEntry(history, projectKey);

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  // Check how many lines we've already processed for this transcript
  let lastProcessedLines = project.processedFiles[transcriptPath]?.lines || 0;
  let newLinesCount = lines.length - lastProcessedLines;

  // If recorded lines exceed actual (file was truncated), recalculate
  if (newLinesCount < 0) {
    lastProcessedLines = 0;
    newLinesCount = lines.length;
  }

  // If no new lines, return accumulated total
  if (newLinesCount <= 0) {
    return project.totalTokens;
  }

  // Calculate only new tokens
  let newTokens = 0;
  for (let i = lastProcessedLines; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      const usage = entry.message?.usage || entry.usage;

      if (usage) {
        const input = (usage.input_tokens || 0)
          + (usage.cache_read_input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0);
        const output = usage.output_tokens || 0;
        newTokens += input + output;
      }
    }
    catch {
      continue;
    }
  }

  // Update history
  project.totalTokens += newTokens;
  if (!project.processedFiles[transcriptPath]) {
    project.processedFiles[transcriptPath] = {};
  }
  project.processedFiles[transcriptPath].lines = lines.length;
  project.lastUpdated = new Date().toISOString();

  saveTokenHistory(history);

  return project.totalTokens;
}

/**
 * Calculate cost from token usage with cross-session accumulation
 * Reads transcript file directly and applies pricing from settings.json
 * Now persists across /clear commands
 */
function calculateCost(transcriptPath, workspaceDir) {
  if (!fs.existsSync(transcriptPath)) {
    return null;
  }

  const projectKey = getProjectKey(workspaceDir);
  const history = loadTokenHistory();
  const project = getProjectEntry(history, projectKey);

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // Check how many lines we've already processed for cost calculation
    // Use separate tracking from 'lines' to avoid race condition with calculateTotalTokens
    const fileInfo = project.processedFiles[transcriptPath] || {};
    let lastProcessedCostLines = fileInfo.costCalculatedLines || 0;
    let newLinesCount = lines.length - lastProcessedCostLines;

    // If recorded lines exceed actual (file was truncated), recalculate
    if (newLinesCount < 0) {
      lastProcessedCostLines = 0;
      newLinesCount = lines.length;
    }

    // If no new lines, return accumulated cost
    // But if cost is null (never calculated), recalculate from all lines
    if (newLinesCount <= 0) {
      if (project.totalCost) {
        return project.totalCost;
      }
      // Cost was never calculated (e.g., cost field was disabled before)
      // Recalculate from all lines by setting lastProcessedCostLines to 0
      lastProcessedCostLines = 0;
      newLinesCount = lines.length;
    }

    // Track token usage and models used (only new lines)
    const modelUsage = {}; // { modelId: { input, output, cacheRead, cacheCreation } }

    for (let i = lastProcessedCostLines; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        const usage = entry.message?.usage || entry.usage;

        if (usage) {
          // Get model ID for this entry
          let modelId = entry.model || entry.message?.model || 'claude-sonnet-4-6';

          if (!modelUsage[modelId]) {
            modelUsage[modelId] = {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheCreation: 0,
            };
          }

          modelUsage[modelId].input += usage.input_tokens || 0;
          modelUsage[modelId].output += usage.output_tokens || 0;
          modelUsage[modelId].cacheRead += usage.cache_read_input_tokens || 0;
          modelUsage[modelId].cacheCreation += usage.cache_creation_input_tokens || 0;
        }
      }
      catch {
        continue;
      }
    }

    // Calculate cost per model
    const pricing = loadPricing();
    const costsByCurrency = {};

    for (const [modelId, usage] of Object.entries(modelUsage)) {
      const price = lookupByModel(pricing, modelId) || pricing['claude-sonnet-4-6'] || { input: 3, output: 15, cache: 0.3, currency: 'USD' };
      const currency = price.currency || 'USD';

      if (!costsByCurrency[currency]) {
        costsByCurrency[currency] = 0;
      }

      costsByCurrency[currency] += (usage.input * price.input / 1_000_000)
        + (usage.output * price.output / 1_000_000)
        + (usage.cacheRead * price.cache / 1_000_000)
        + (usage.cacheCreation * price.cache / 1_000_000);
    }

    // Return the primary currency cost
    const currencies = Object.keys(costsByCurrency);

    if (currencies.length === 0) {
      // No new usage data in this transcript, return existing accumulated cost
      // Save costCalculatedLines state so we don't reprocess empty lines next time
      if (!project.processedFiles[transcriptPath]) {
        project.processedFiles[transcriptPath] = {};
      }
      if (project.processedFiles[transcriptPath].costCalculatedLines !== lines.length) {
        project.processedFiles[transcriptPath].costCalculatedLines = lines.length;
        saveTokenHistory(history);
      }
      return project.totalCost || null;
    }

    const primaryCurrency = currencies[0];
    const newCost = {
      amount: costsByCurrency[primaryCurrency],
      currency: primaryCurrency,
    };

    // Accumulate with existing cost
    let currentAmount = project.totalCost?.amount || 0;
    // Handle currency mismatch by using new cost's currency
    if (project.totalCost && project.totalCost.currency !== primaryCurrency) {
      currentAmount = 0; // Reset on currency change
    }

    project.totalCost = {
      amount: currentAmount + newCost.amount,
      currency: primaryCurrency,
    };
    // Update processedFiles state - only update costCalculatedLines, not 'lines'
    // 'lines' is managed by calculateTotalTokens to avoid race conditions
    if (!project.processedFiles[transcriptPath]) {
      project.processedFiles[transcriptPath] = {};
    }
    project.processedFiles[transcriptPath].costCalculatedLines = lines.length;
    project.lastUpdated = new Date().toISOString();

    saveTokenHistory(history);

    return project.totalCost;
  }
  catch {
    return project.totalCost;
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
  // Model alias mapping from CLI family flags to default model IDs
  const aliasMap = {
    '--opus': 'claude-opus-4-8',
    '--sonnet': 'claude-sonnet-4-6',
    '--haiku': 'claude-haiku-4-5',
  };

  // Try to get actual model from input's model.display_name
  if (input?.model?.display_name) {
    modelId = input.model.display_name;
  }

  // Resolve alias
  const actualModel = aliasMap[modelId] || modelId;

  const modelMap = {
    // Claude (default)
    'claude-opus-4-8': 'Opus 4.8',
    'claude-opus-4-7': 'Opus 4.7',
    'claude-opus-4-6': 'Opus 4.6',
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-sonnet-4-5': 'Sonnet 4.5',
    'claude-haiku-4-5': 'Haiku 4.5',
    // GLM (optional — configure pricing/context via settings.json if you use these)
    'glm-5.2': 'GLM-5.2',
    'glm-5.1': 'GLM-5.1',
    'glm-5': 'GLM-5',
    'glm-4.7': 'GLM-4.7',
    'glm-4.5-air': 'GLM-4.5',
  };
  return lookupByModel(modelMap, actualModel) || actualModel;
}

/**
 * Build statusline output with configurable fields
 */
function buildStatusLine(input) {
  const config = loadConfig();
  const parts = [];
  const transcriptPath = input?.transcript_path;
  const workspaceDir = input?.workspace?.current_dir || process.cwd();
  const inGitRepo = isGitRepo(workspaceDir);

  // 1. Directory
  if (config.fields.dir) {
    const dirName = getDirName(input);
    if (dirName) {
      parts.push(`${colorConfig.dir}${ICONS.dir} ${dirName}${colors.reset}`);
    }
  }

  // 2. Git branch
  if (config.fields.git && inGitRepo) {
    const gitInfo = getGitInfo(workspaceDir);
    if (gitInfo.branch) {
      const statusIcon = gitInfo.dirty ? ICONS.gitDirty : ICONS.gitClean;
      const branchColor = gitInfo.dirty ? colors.brightRed : colorConfig.git;
      parts.push(`${branchColor}${ICONS.git} ${gitInfo.branch}${statusIcon}${colors.reset}`);
    }
  }

  // 3. Git remote status
  if (config.fields.remote && inGitRepo) {
    const remoteStatus = getGitRemoteStatus(workspaceDir);
    parts.push(`${colors.cyan}${remoteStatus}${colors.reset}`);
  }

  // 4. Code changes
  if (config.fields.changes && inGitRepo) {
    parts.push(getGitChanges(workspaceDir));
  }

  // 5. Session duration
  if (config.fields.duration && transcriptPath) {
    const duration = getSessionDuration(transcriptPath, workspaceDir);
    if (duration) {
      parts.push(`${colors.brightWhite}⏱${colors.reset} ${duration}`);
    }
  }

  // 6. Context window usage
  if (config.fields.context && transcriptPath) {
    const modelId = input?.model?.id || 'claude-sonnet-4-6';
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
    const modelId = input?.model?.id || 'claude-sonnet-4-6';
    const modelDisplay = getModelDisplay(modelId, input);
    if (modelDisplay) {
      parts.push(`M: ${modelDisplay}`);
    }
  }

  // 8. Total session tokens
  if (config.fields.token && transcriptPath) {
    const totalTokens = calculateTotalTokens(transcriptPath, workspaceDir);
    parts.push(`${colorConfig.label}T:${colors.reset} ${colorConfig.token}${formatTokens(totalTokens)}${colors.reset}`);
  }

  // 9. Cost
  if (config.fields.cost && transcriptPath) {
    let cost = null;
    let currency = 'USD';

    if (input?.cost?.usd !== undefined) {
      cost = input.cost.usd;
      currency = 'USD';
    }
    else {
      const costResult = calculateCost(transcriptPath, workspaceDir);
      if (costResult) {
        // Handle both old format (number) and new format (object)
        if (typeof costResult === 'object') {
          cost = costResult.amount;
          currency = costResult.currency || 'USD';
        }
        else {
          cost = costResult;
        }
      }
    }

    if (cost !== null && !isNaN(cost) && cost > 0) {
      const costStr = cost.toFixed(2);
      const currencySymbol = currency === 'CNY' ? '¥' : '$';
      parts.push(`${colorConfig.label}${currencySymbol}:${colors.reset} ${colorConfig.cost}${costStr}${colors.reset}`);
    }
  }

  return parts.join(config.separator);
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);

  // Handle --reset-tokens: reset token history for current or specified project
  if (args.includes('--reset-tokens')) {
    const history = loadTokenHistory();
    const projectKey = getProjectKey(process.cwd());

    if (history.projects[projectKey]) {
      const { totalTokens, totalCost } = history.projects[projectKey];
      delete history.projects[projectKey];
      saveTokenHistory(history);

      console.log(`Token history reset for project: ${projectKey}`);
      console.log(`Previous totals: ${formatTokens(totalTokens)}${totalCost ? `, ${totalCost.currency} ${totalCost.amount.toFixed(2)}` : ''}`);
    }
    else {
      console.log(`No token history found for project: ${projectKey}`);
    }
    process.exit(0);
  }

  // Handle --reset-all-tokens: reset all token history
  if (args.includes('--reset-all-tokens')) {
    const history = loadTokenHistory();
    const projectCount = Object.keys(history.projects).length;
    history.projects = {};
    saveTokenHistory(history);

    console.log(`Token history reset for ${projectCount} project(s)`);
    process.exit(0);
  }

  // Handle --show-history: show token history for all projects
  if (args.includes('--show-history')) {
    const history = loadTokenHistory();
    const projects = Object.entries(history.projects);

    if (projects.length === 0) {
      console.log('No token history found.');
      process.exit(0);
    }

    console.log('\nToken History by Project:\n');
    for (const [projectPath, data] of projects) {
      const costStr = data.totalCost
        ? `${data.totalCost.currency} ${data.totalCost.amount.toFixed(2)}`
        : 'N/A';
      const durationStr = formatDuration(data.totalDurationMs || 0);
      console.log(`Project: ${projectPath}`);
      console.log(`  Tokens: ${formatTokens(data.totalTokens)}`);
      console.log(`  Cost: ${costStr}`);
      console.log(`  Duration: ${durationStr || 'N/A'}`);
      console.log(`  Last Updated: ${data.lastUpdated}`);
      console.log('');
    }
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(PACKAGE_VERSION);
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
ccbar v${PACKAGE_VERSION} — Enhanced StatusLine for Claude Code

USAGE:
  ccbar [transcript-path]   Run statusline (reads stdin JSON from Claude Code)
  echo '{"transcript_path":"..."}' | ccbar

OPTIONS:
  --version, -v        Print version and exit
  --help, -h           Show this help and exit
  --reset-tokens       Reset token/cost/duration history for the current project
  --reset-all-tokens   Reset token history for ALL projects
  --show-history       Show token history for all projects

DISPLAY FIELDS (in order):
  D: <dir>             Current directory (git root basename)
  G: <branch><*>       Git branch (* when dirty)
  <≡ | ↑N ↓N>          Remote sync status (ahead/behind)
  +<add> -<del>        Working tree + staged + untracked changes
  ⏱ <duration>         Active session time (idle gaps excluded)
  <used>/<max>(<pct>)  Context window usage
  M: <model>           Resolved model name
  T: <tokens>M         Total session tokens (millions)
  $: <cost> | ¥: <cost> Session cost

CONFIG:
  ~/.claude/ccbar/config.json   Toggle fields (dir/git/remote/changes/duration/context/model/token/cost)
  ~/.claude/settings.json       modelPricing, modelContextWindow overrides

EXAMPLE OUTPUT:
  D: myapp | G: main | ≡ | +12 -3 | ⏱ 1h 5m | 47.3K/200K(23.6%) | M: Sonnet 4.6 | T: 1.24M | $: 2.81

INSTALL (npm):
  npm i -g @luckvd/ccbar
  Then in ~/.claude/settings.json:
    { "statusLine": { "type": "command", "command": "ccbar", "padding": 0 } }
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
