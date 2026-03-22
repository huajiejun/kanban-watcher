import "./index";
import { createPreviewHass, previewEntityId } from "./dev/preview-fixture";

type PlaygroundCard = HTMLElement & {
  hass?: ReturnType<typeof createPreviewHass>;
  setConfig(config: { entity: string }): void;
};

const mountPoint = document.querySelector("[data-preview-root]");

if (mountPoint) {
  const card = document.createElement("kanban-watcher-card") as PlaygroundCard;
  card.setConfig({ entity: previewEntityId });
  card.hass = createPreviewHass();
  mountPoint.append(card);
}
