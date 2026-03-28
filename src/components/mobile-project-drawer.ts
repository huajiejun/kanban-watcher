import { LitElement, html, css, nothing } from "lit";
import {
  fetchOrganizations,
  fetchProjects,
} from "../lib/issue-api";
import type {
  RemoteOrganization,
  RemoteProject,
} from "../types/issue";

const STORAGE_KEY_ORG = "kanban_selected_org_id";
const STORAGE_KEY_PROJECT = "kanban_selected_project_id";

export class MobileProjectDrawer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* 遮罩层 */
    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100;
      transition: opacity 0.2s ease-out;
      -webkit-tap-highlight-color: transparent;
    }

    .drawer-backdrop.hidden {
      opacity: 0;
      pointer-events: none;
    }

    /* 抽屉面板 */
    .drawer-panel {
      position: fixed;
      left: 0;
      top: 0;
      height: 100%;
      width: 280px;
      background: color-mix(
        in srgb,
        var(--primary-background-color, #111827) 95%,
        transparent
      );
      z-index: 101;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s ease-out;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    .drawer-panel.hidden {
      transform: translateX(-100%);
      pointer-events: none;
    }

    /* 头部 */
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      flex-shrink: 0;
    }

    .drawer-org-name {
      font-size: 0.88rem;
      font-weight: 600;
      color: #e5e7eb;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .drawer-close {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
      font-size: 1.1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }

    /* 项目列表 */
    .drawer-projects {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
    }

    .drawer-projects::-webkit-scrollbar {
      width: 3px;
    }

    .drawer-projects::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.2);
      border-radius: 3px;
    }

    .project-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: #cbd5e1;
      font-size: 0.85rem;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      -webkit-tap-highlight-color: transparent;
    }

    .project-item:active {
      background: rgba(148, 163, 184, 0.12);
    }

    .project-item.active {
      background: color-mix(
        in srgb,
        var(--primary-color, #38bdf8) 12%,
        transparent
      );
      color: #e5e7eb;
    }

    .project-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .project-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* 加载状态 */
    .drawer-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: var(--secondary-text-color, #94a3b8);
      font-size: 0.82rem;
    }
  `;

  baseUrl = "";
  apiKey = "";
  open = false;
  organizations: RemoteOrganization[] = [];
  projects: RemoteProject[] = [];
  selectedOrgId = "";
  selectedProjectId = "";
  loading = false;

  static properties = {
    baseUrl: { type: String, attribute: "base-url" },
    apiKey: { type: String, attribute: "api-key" },
    open: { type: Boolean },
    organizations: { attribute: false },
    projects: { attribute: false },
    selectedOrgId: { attribute: false },
    selectedProjectId: { attribute: false },
    loading: { type: Boolean, attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    void this.initSelector();
  }

  async initSelector() {
    this.loading = true;
    try {
      const orgs = await fetchOrganizations({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
      });
      this.organizations = orgs;

      const savedOrgId = localStorage.getItem(STORAGE_KEY_ORG);
      const orgId = orgs.find((o) => o.id === savedOrgId)
        ? savedOrgId
        : orgs.length > 0
          ? orgs[0].id
          : "";

      if (orgId) {
        await this.handleOrgChange(orgId);
      }
    } catch (err) {
      console.error("加载组织失败:", err);
    } finally {
      this.loading = false;
    }
  }

  async handleOrgChange(orgId: string) {
    this.selectedOrgId = orgId;
    localStorage.setItem(STORAGE_KEY_ORG, orgId);
    this.projects = [];
    this.selectedProjectId = "";

    try {
      const projects = await fetchProjects(
        { baseUrl: this.baseUrl, apiKey: this.apiKey },
        orgId
      );
      this.projects = projects;

      const savedProjectId = localStorage.getItem(STORAGE_KEY_PROJECT);
      const projectId = projects.find((p) => p.id === savedProjectId)
        ? savedProjectId
        : projects.length > 0
          ? projects[0].id
          : "";

      if (projectId) {
        this.selectedProjectId = projectId;
      }
    } catch (err) {
      console.error("加载项目失败:", err);
    }
  }

  handleProjectClick(projectId: string) {
    this.selectedProjectId = projectId;
    localStorage.setItem(STORAGE_KEY_PROJECT, projectId);
    this.dispatchEvent(
      new CustomEvent("project-changed", {
        detail: { projectId },
        bubbles: true,
        composed: true,
      })
    );
    this.open = false;
  }

  handleBackdropClick() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("drawer-closed", { bubbles: true, composed: true }));
  }

  handleClose() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("drawer-closed", { bubbles: true, composed: true }));
  }

  render() {
    const orgName =
      this.organizations.find((o) => o.id === this.selectedOrgId)?.name ??
      "Organization";

    return html`
      ${this.open
        ? html`
          <div
            class="drawer-backdrop ${this.open ? "" : "hidden"}"
            @click=${this.handleBackdropClick}
          ></div>
          <div
            class="drawer-panel ${this.open ? "" : "hidden"}"
          >
            <div class="drawer-header">
              <span class="drawer-org-name">${orgName}</span>
              <button
                class="drawer-close"
                type="button"
                @click=${this.handleClose}
              >
                ×
              </button>
            </div>
            ${this.loading
              ? html`<div class="drawer-loading">加载中...</div>`
              : this.projects.length === 0
                ? html`<div class="drawer-loading">暂无项目</div>`
                : html`
                  <div class="drawer-projects">
                    ${this.projects.map(
                      (p) =>
                        html`<button
                          class="project-item ${p.id ===
                          this.selectedProjectId
                            ? "active"
                            : ""}"
                          type="button"
                          @click=${() =>
                            this.handleProjectClick(p.id)}
                        >
                          <span
                            class="project-dot"
                            style="background: ${p.color || "#94a3b8"}"
                          ></span>
                          <span class="project-name">${p.name}</span>
                        </button>`
                    )}
                  </div>
                `}
          </div>
        `
        : nothing}
    `;
  }
}

customElements.define("mobile-project-drawer", MobileProjectDrawer);
