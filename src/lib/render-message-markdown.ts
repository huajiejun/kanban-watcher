import { marked, type Tokens } from "marked";
import hljs from "highlight.js";

// 自定义渲染器，支持代码高亮
const renderer = {
  code(token: Tokens.Code): string {
    const code = token.text;
    const lang = token.lang;

    let highlighted: string;
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(code, { language: lang }).value;
      } catch {
        highlighted = hljs.highlightAuto(code).value;
      }
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }

    return `<pre><code class="hljs language-${lang || ""}">${highlighted}</code></pre>`;
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
