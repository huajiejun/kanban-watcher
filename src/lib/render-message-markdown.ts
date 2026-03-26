import { marked, type Tokens } from "marked";
import { highlightMarkup } from "./code-highlighter";

// 自定义渲染器，支持代码高亮
const renderer = {
  code(token: Tokens.Code): string {
    const code = token.text;
    const lang = token.lang;

    const highlighted = highlightMarkup(code, lang) ?? escapeHtml(code);

    return `<pre><code class="hljs language-${lang || ""}">${highlighted}</code></pre>`;
  },
  html(token: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(token.text);
  },
};

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// 使用自定义渲染器
marked.use({ renderer });

export function renderMessageMarkdown(value: string) {
  return marked.parse(value) as string;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
