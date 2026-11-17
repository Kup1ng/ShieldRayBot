"""The PasarGuard groups list gives a group's inbound tags as separate readable strings."""

from __future__ import annotations

from app.services.pg_resources_panel import serialize_group


def test_inbound_tags_are_a_list_of_strings_not_a_printed_python_list() -> None:
    row = serialize_group({"id": 1, "name": "main", "inbound_tags": ["vless-ws", "trojan-grpc"]})
    assert row["inbound_tags"] == ["vless-ws", "trojan-grpc"]


def test_a_group_without_tags_has_an_empty_list_and_a_single_tag_string_is_one_tag() -> None:
    assert serialize_group({"id": 1, "name": "empty", "inbound_tags": []})["inbound_tags"] == []
    assert serialize_group({"id": 1, "name": "none"})["inbound_tags"] == []
    assert serialize_group({"id": 1, "name": "one", "inbound_tags": "vless-ws"})["inbound_tags"] == ["vless-ws"]


def test_hostile_tags_are_kept_as_plain_data_for_the_page_to_escape() -> None:
    row = serialize_group({"id": 2, "name": "bad", "inbound_tags": ["<script>x</script>"]})
    assert row["inbound_tags"] == ["<script>x</script>"]
