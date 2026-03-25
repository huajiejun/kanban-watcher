import { highlightMarkup } from "./code-highlighter";

/**
 * Detect language from file path
 */
export function detectLanguageFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    sql: "sql",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    dockerfile: "dockerfile",
    makefile: "makefile",
    vue: "vue",
    svelte: "svelte",
    xml: "xml",
    graphql: "graphql",
    gql: "graphql",
  };
  return ext ? languageMap[ext] : undefined;
}

/**
 * Highlight code with language detection
 */
export function highlightCode(code: string, language?: string): string {
  const highlighted = highlightMarkup(code, language);
  return highlighted ?? escapeHtml(code);
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Diff line type
 */
type DiffLineType = "add" | "remove" | "header" | "context";

interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Parse unified diff into lines
 */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const result: DiffLine[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // Hunk header: @@ -1,4 +1,5 @@
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      result.push({ type: "header", content: line });
      continue;
    }

    // File header
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff --git")) {
      result.push({ type: "header", content: line });
      continue;
    }

    // Added line
    if (line.startsWith("+")) {
      result.push({
        type: "add",
        content: line.slice(1),
        newLineNumber: newLineNum++,
      });
      continue;
    }

    // Removed line
    if (line.startsWith("-")) {
      result.push({
        type: "remove",
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
      });
      continue;
    }

    // Context line
    if (line.startsWith(" ") || line === "") {
      result.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : "",
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
      continue;
    }

    // Other lines (like index, mode changes)
    result.push({ type: "context", content: line });
  }

  return result;
}

/**
 * Render unified diff with syntax highlighting
 */
export function renderDiffWithHighlight(diff: string, language?: string): string {
  const lines = parseUnifiedDiff(diff);
  const maxLineNum = Math.max(
    ...lines.map((l) => Math.max(l.oldLineNumber ?? 0, l.newLineNumber ?? 0)),
  );
  const lineNumWidth = String(maxLineNum).length;

  const htmlLines = lines.map((line) => {
    const escapedContent = highlightCode(line.content, language);

    switch (line.type) {
      case "header":
        return `<div class="diff-line diff-header"><span class="diff-content">${escapedContent}</span></div>`;
      case "add":
        return `<div class="diff-line diff-add"><span class="diff-num">${line.newLineNumber ?? ""}</span><span class="diff-sign">+</span><span class="diff-content">${escapedContent}</span></div>`;
      case "remove":
        return `<div class="diff-line diff-remove"><span class="diff-num">${line.oldLineNumber ?? ""}</span><span class="diff-sign">-</span><span class="diff-content">${escapedContent}</span></div>`;
      case "context":
        return `<div class="diff-line diff-context"><span class="diff-num">${String(line.oldLineNumber ?? "").padStart(lineNumWidth, " ")}</span><span class="diff-sign"> </span><span class="diff-content">${escapedContent}</span></div>`;
    }
  });

  return htmlLines.join("");
}

/**
 * Render code content with syntax highlighting
 */
export function renderCodeWithHighlight(code: string, language?: string): string {
  const highlighted = highlightCode(code, language);
  const lines = code.split("\n");

  const htmlLines = lines.map((line, index) => {
    const highlightedLine = highlighted.split("\n")[index] || escapeHtml(line);
    const lineNum = index + 1;
    return `<div class="code-line"><span class="line-num">${lineNum}</span><span class="line-content">${highlightedLine}</span></div>`;
  });

  return htmlLines.join("");
}
