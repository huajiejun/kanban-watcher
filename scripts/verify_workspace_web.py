from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


def wait_ready(page) -> None:
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(600)


def screenshot_desktop(page, base_url: str, api_key: str, output_dir: Path) -> None:
    page.set_viewport_size({"width": 1440, "height": 1024})
    page.goto(f"{base_url}/?api_key={api_key}")
    wait_ready(page)
    page.screenshot(path=str(output_dir / "首页-桌面列表.png"), full_page=True)

    cards = page.locator(".task-card")
    if cards.count() > 0:
      cards.first.click()
      page.wait_for_timeout(500)
      page.screenshot(path=str(output_dir / "首页-桌面打开窗格.png"), full_page=True)


def screenshot_mobile(page, base_url: str, api_key: str, output_dir: Path) -> None:
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{base_url}/?api_key={api_key}")
    wait_ready(page)
    page.screenshot(path=str(output_dir / "首页-手机卡片模式.png"), full_page=True)


def screenshot_preview(page, base_url: str, api_key: str, output_dir: Path) -> None:
    page.set_viewport_size({"width": 1440, "height": 1024})
    page.goto(f"{base_url}/preview?api_key={api_key}")
    wait_ready(page)
    page.screenshot(path=str(output_dir / "预览页-卡片预览.png"), full_page=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        screenshot_desktop(page, args.base_url, args.api_key, output_dir)
        screenshot_mobile(page, args.base_url, args.api_key, output_dir)
        screenshot_preview(page, args.base_url, args.api_key, output_dir)
        browser.close()


if __name__ == "__main__":
    main()
