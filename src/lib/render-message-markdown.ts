import { marked } from "marked";

// 配置 marked 选项
marked.setOptions({
  breaks: true, // 支持 GitHub 风格的换行
  gfm: true, // 启用 GitHub Flavored Markdown
});

export function renderMessageMarkdown(value: string) {
  return marked.parse(value) as string;
}
