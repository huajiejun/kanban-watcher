# Kanban Watcher Home Assistant Card UI Design

Date: 2026-03-21

## Goal

Design a Home Assistant Lovelace card for the `sensor.kanban_watcher_kanban_watcher` entity that presents Kanban Watcher workspaces as a compact, readable board-like status card.

The card should:

- Group tasks into three collapsible sections: `需要注意`, `运行中`, `空闲`
- Hide any empty section entirely
- Show each workspace as a compact two-line task card
- Prioritize readability in Home Assistant over heavy kanban visuals

## Source Data

Primary entity:

- `sensor.kanban_watcher_kanban_watcher`

Important attributes:

- `count`
- `attention_count`
- `updated_at`
- `workspaces` as an array of workspace objects

Each workspace may contain:

- `id`
- `name`
- `status`
- `has_unseen_turns`
- `has_pending_approval`
- `files_changed`
- `lines_added`
- `lines_removed`
- `completed_at`
- `needs_attention`
- `pr_status`
- `pr_url`

## Information Architecture

The card is a single Lovelace card container with up to three sections in fixed order:

1. `需要注意`
2. `运行中`
3. `空闲`

Section visibility rules:

- If a section has zero tasks, the whole section is hidden
- If all sections are empty, show a single empty state: `当前没有任务`

Task grouping rules:

- `需要注意`: any workspace where `needs_attention = true` or `has_pending_approval = true`
- `运行中`: any workspace where `status = running` and the workspace is not already in `需要注意`
- `空闲`: all remaining workspaces

This makes `需要注意` the highest-priority bucket so the same task does not appear in multiple sections.

## Card Layout

Each visible section contains:

- A section header row
- A list of workspace task cards

Section header row:

- Left: section title
- Right: expand/collapse chevron
- Optional: small count badge if it improves clarity

Default behavior:

- Sections are expanded by default
- Tapping the section header toggles collapse/expand
- First version does not require task-level expansion

## Task Card Layout

Each workspace is shown as a compact two-line card.

Line 1:

- Workspace name only

Line 2:

- Left cluster: status icons
- Middle: relative time
- Right: file change summary

Displayed details:

- Workspace name
- Status indicator icon(s)
- Relative time such as `just now`, `5m ago`, `1d ago`
- `files_changed`
- `lines_added`
- `lines_removed`

No click behavior is required in the first version. Cards are display-only.

## Status and Time Rules

Status icon guidance:

- `needs_attention`: orange warning circle or highlighted dot
- `has_pending_approval`: raised-hand icon
- `running`: play/progress indicator
- neutral idle/completed states: gray dot

Relative time source:

- Prefer `completed_at` for completed workspaces
- Otherwise use entity `updated_at` as a fallback for current freshness

If more precise per-workspace update data becomes available later, it can replace this fallback without changing the visual structure.

## Visual Direction

The card should follow a dark, lightweight, Home Assistant-friendly panel style.

Visual principles:

- Match Home Assistant card density and rhythm
- Keep the design list-oriented rather than building large boxed kanban columns
- Use restrained accent color, not large blocks of saturated background

Recommended styling:

- Section titles are visibly larger and bolder than task content
- Task cards use subtle spacing, not thick borders between every item
- Use a thin accent bar or small visual marker for emphasis instead of heavy card chrome
- Workspace names use a stronger weight than metadata
- Metadata row uses muted gray text
- Added lines use green
- Removed lines use red
- File count uses neutral gray

Suggested state colors:

- Attention: amber/orange
- Approval: amber/yellow accent with hand icon
- Running: green or blue-green
- Idle/completed: neutral gray

## Chosen Layout Direction

Chosen direction: `A. 看板分栏型`

Why this direction was chosen:

- Best matches the user's reference image
- Preserves the requested three-section structure
- Works well within Lovelace vertical card constraints
- Keeps task information readable without over-designing the card

Rejected alternatives:

- `统计头图型`: too much emphasis on summary counters over task details
- `时间线紧凑型`: efficient, but weakens the required three-lane collapsible structure

## Error Handling and Empty States

- Empty sections are hidden entirely
- If all three sections are empty, show `当前没有任务`
- Missing numeric fields should render as `0`
- Missing time fields should fall back to a neutral label such as `recently`

## Testing Considerations

Implementation should be verified against:

- Only `需要注意` present
- Only `运行中` present
- Only `空闲` present
- Mixed sections with all three visible
- All sections empty
- Long workspace names that require truncation
- Large diff counts that stress line wrapping
- `has_pending_approval` and `needs_attention` appearing together

## Implementation Notes

The first implementation should focus on:

- Parsing `workspaces`
- Grouping and sorting into sections
- Rendering collapsible sections
- Rendering compact task cards with stable spacing
- Formatting relative time labels

Out of scope for the first version:

- Card click navigation
- Task-level expansion
- PR-specific inline actions
- Advanced persistence for collapsed section state
