from app.knowledge.repository import search


def find_best_knowledge_answer(
    org_id: str,
    text: str,
) -> dict:
    if not text or not text.strip():
        return {
            "found": False,
            "answer": None,
            "items": [],
            "best_item": None,
        }

    items = search(org_id, text, "WHATSAPP", limit=5)

    if not items:
        return {
            "found": False,
            "answer": None,
            "items": [],
            "best_item": None,
        }

    best_item = items[0]

    return {
        "found": True,
        "answer": best_item.get("matched_content") or best_item["content"],
        "items": items,
        "best_item": best_item,
    }


def build_knowledge_reply(
    org_name: str,
    answer: str,
) -> str:
    return (
        f"{org_name} vous informe :\n\n"
        f"{answer}"
    )
