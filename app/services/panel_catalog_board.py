"""The plans list grouped by category, shaped for the React Plans page.

The grouping itself (order, bot colour, why a category has no bot button) is ``plan_category_board``; this
module only turns that board into JSON the screen can draw. Plans are not repeated here: a group lists the ids of
its plans, in the order the page shows them, and the page looks them up in the plan list it already has.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.db.models import Plan, PlanCategory
from app.services.plan_category_board import CategoryGroup, PlanBoard, build_plan_board


def _group_payload(group: CategoryGroup, *, is_first: bool, is_last: bool) -> dict[str, Any]:
    return {
        "category_id": int(group.category.id),
        "name": group.category.name,
        "tone": group.tone,
        "is_active": bool(group.category.is_active),
        "in_bot": group.in_bot,
        "bot_note": group.bot_note,
        "plan_ids": [int(plan.id) for plan in group.plans],
        "can_move_up": not is_first,
        "can_move_down": not is_last,
    }


def board_payload(board: PlanBoard) -> dict[str, Any]:
    """``has_categories`` is False for a shop without user categories: the page then lists plans flat."""
    last = len(board.groups) - 1
    return {
        "has_categories": board.has_categories,
        "groups": [_group_payload(g, is_first=i == 0, is_last=i == last) for i, g in enumerate(board.groups)],
        "other": {
            "title": board.other_title,
            "note": board.other_note,
            "plan_ids": [int(plan.id) for plan in board.other_plans],
        },
    }


def plan_board_payload(
    plans: Sequence[Plan], categories: Sequence[PlanCategory], *, ui: Mapping[str, object] | None = None
) -> dict[str, Any]:
    """Sale plans under the staff shop's own user categories, in the order of the bot's category buttons."""
    return board_payload(build_plan_board(plans, categories, ui=ui))


def empty_board() -> dict[str, Any]:
    """The board of a catalog the staff member has no categories access to."""
    return {"has_categories": False, "groups": [], "other": {"title": "", "note": "", "plan_ids": []}}
