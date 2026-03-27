from pathlib import Path
import json
from playwright.sync_api import sync_playwright


APP_URL = "http://127.0.0.1:6020"
OUTPUT_DIR = Path("test-images/快捷网页入口需求")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    console_messages: list[str] = []
    page_errors: list[str] = []
    request_failures: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()

        page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on(
            "requestfailed",
            lambda req: request_failures.append(f"{req.method} {req.url} -> {req.failure}"),
        )

        page.goto(APP_URL, wait_until="load")
        page.wait_for_timeout(1500)

        api_text = page.evaluate(
            """
            async () => {
              const response = await fetch('/api/workspaces/active');
              return await response.text();
            }
            """
        )

        task_cards = page.locator(".task-card")
        task_card_count = task_cards.count()

        result: dict[str, object] = {
            "api_workspaces_active": api_text,
            "task_card_count": task_card_count,
            "console_messages": console_messages,
            "page_errors": page_errors,
            "request_failures": request_failures,
        }

        page.screenshot(path=str(OUTPUT_DIR / "手机端-首页.png"), full_page=True)

        if task_card_count > 0:
            task_cards.first.click()
            page.wait_for_timeout(800)
            page.screenshot(path=str(OUTPUT_DIR / "手机端-工作区弹窗.png"), full_page=True)

            web_button = page.locator(".dialog-web-preview").first
            result["web_button_count"] = page.locator(".dialog-web-preview").count()
            result["web_button_disabled"] = web_button.is_disabled() if web_button.count() > 0 else None
            result["web_button_aria_label"] = web_button.get_attribute("aria-label") if web_button.count() > 0 else None

            if web_button.count() > 0 and not web_button.is_disabled():
                web_button.click()
                page.wait_for_timeout(800)
                overlay = page.locator(".workspace-home-web-preview-overlay").first
                frame = page.locator(".workspace-home-web-preview-frame").first
                result["overlay_visible"] = overlay.is_visible() if overlay.count() > 0 else False
                result["frame_src"] = frame.get_attribute("src") if frame.count() > 0 else None
                page.screenshot(path=str(OUTPUT_DIR / "手机端-快捷网页弹层.png"), full_page=True)

        print(json.dumps(result, ensure_ascii=False, indent=2))

        context.close()
        browser.close()


if __name__ == "__main__":
    main()
