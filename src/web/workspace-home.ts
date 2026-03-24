export function mountWorkspaceHome(root: Element) {
  root.innerHTML = `
    <main class="workspace-home-shell">
      <section class="workspace-home-hero">
        <div class="workspace-home-eyebrow">Web Workspace</div>
        <h1>Kanban Watcher 网页工作区</h1>
        <p>左侧项目状态栏和右侧多工作区内容区将在这里加载。</p>
      </section>
      <section class="workspace-home-placeholder" data-workspace-home>
        网页工作区入口已就绪，下一步接入状态列表和多窗格内容区。
      </section>
    </main>
  `;
}
