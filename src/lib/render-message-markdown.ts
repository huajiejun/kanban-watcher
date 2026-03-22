function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMessageMarkdown(value: string) {
  const lines = value.replace(/\r\n/g, "\n").trim().split("\n");
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]?.trim() ?? "";

    if (!line) {
      index += 1;
      continue;
    }

    // 处理代码块 ```lang ... ```
    if (line.startsWith("```")) {
      const langMatch = line.match(/^```(\w*)$/);
      const lang = langMatch?.[1] ?? "";
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length) {
        const codeLine = lines[index];
        if (codeLine?.trim() === "```") {
          index += 1;
          break;
        }
        codeLines.push(escapeHtml(codeLine ?? ""));
        index += 1;
      }

      const langLabel = lang ? `<div class="code-lang">${lang}</div>` : "";
      blocks.push(
        `<div class="code-block">${langLabel}<pre><code>${codeLines.join("\n")}</code></pre></div>`,
      );
      continue;
    }

    // 处理标题 ### ## #
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1]?.length ?? 1;
      const text = headerMatch[2] ?? "";
      blocks.push(`<h${level}>${renderInlineMarkdown(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];

      while (index < lines.length) {
        const itemLine = lines[index]?.trim() ?? "";
        if (!itemLine.startsWith("- ")) {
          break;
        }
        items.push(`<li>${renderInlineMarkdown(itemLine.slice(2).trim())}</li>`);
        index += 1;
      }

      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const paragraphLine = lines[index]?.trim() ?? "";
      if (!paragraphLine || paragraphLine.startsWith("- ") || paragraphLine.startsWith("#") || paragraphLine.startsWith("```")) {
        break;
      }
      paragraphLines.push(renderInlineMarkdown(paragraphLine));
      index += 1;
    }

    blocks.push(`<p>${paragraphLines.join("<br />")}</p>`);
  }

  return blocks.join("");
}
