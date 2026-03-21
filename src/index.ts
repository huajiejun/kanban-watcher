import { KanbanWatcherCard } from "./kanban-watcher-card";

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description: string;
    }>;
  }

  interface HTMLElementTagNameMap {
    "kanban-watcher-card": KanbanWatcherCard;
  }
}

if (!customElements.get("kanban-watcher-card")) {
  customElements.define("kanban-watcher-card", KanbanWatcherCard);
}

window.customCards = window.customCards ?? [];

if (!window.customCards.some((card) => card.type === "kanban-watcher-card")) {
  window.customCards.push({
    type: "kanban-watcher-card",
    name: "Kanban Watcher Card",
    description: "Compact Home Assistant card for Kanban Watcher workspaces.",
  });
}

export { KanbanWatcherCard };
