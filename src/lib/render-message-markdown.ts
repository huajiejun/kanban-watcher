import { marked } from "marked";
import hljs from "highlight.js";

// 配置 marked 选项，启用代码高亮
marked.setOptions({
  breaks: true,
  gfm: true,
  highlight: function (code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        // ignore
      }
    }
    return hljs.highlightAuto(code).value;
  },
});

export function renderMessageMarkdown(value: string) {
  return marked.parse(value) as string;
}
