from pathlib import Path
from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:5173/?base_url=http://127.0.0.1:7778&api_key=wolale1990&messages_limit=50"
OUTPUT_DIR = Path("test-images/工作区共享布局实时同步")


def read_page_state(page):
    return page.evaluate(
        """
        () => {
          const element = document.querySelector('kanban-workspace-home');
          if (!element) return null;
          return {
            pageState: element.pageState,
            workspaces: element.workspaces?.map((item) => item.id) ?? [],
            hasCards: !!element.shadowRoot?.querySelector('.task-card'),
          };
        }
        """
    )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page_a = browser.new_page()
        page_b = browser.new_page()

        logs = {"A": [], "B": []}
        page_a.on("console", lambda msg: logs["A"].append(f"{msg.type}: {msg.text}"))
        page_b.on("console", lambda msg: logs["B"].append(f"{msg.type}: {msg.text}"))

        page_a.goto(URL)
        page_b.goto(URL)
        page_a.wait_for_load_state("networkidle")
        page_b.wait_for_load_state("networkidle")
        page_a.wait_for_selector(".task-card")
        page_b.wait_for_selector(".task-card")

        before_a = read_page_state(page_a)
        before_b = read_page_state(page_b)

        page_a.locator(".task-card").nth(0).click()
        page_a.wait_for_timeout(1200)
        page_b.wait_for_timeout(1200)

        after_a = read_page_state(page_a)
        after_b = read_page_state(page_b)

        page_a.screenshot(path=str(OUTPUT_DIR / "A端点击后.png"), full_page=True)
        page_b.screenshot(path=str(OUTPUT_DIR / "B端同步结果.png"), full_page=True)

        print("before_a", before_a)
        print("before_b", before_b)
        print("after_a", after_a)
        print("after_b", after_b)
        print("console_a", logs["A"])
        print("console_b", logs["B"])

        browser.close()


if __name__ == "__main__":
    main()
