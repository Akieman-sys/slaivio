from app.knowledge.repository import search


def retrieve_relevant_knowledge(
    org_id: str,
    user_message: str,
    limit: int = 5,
):
    # No fallback to unrelated documents: an empty result must escalate rather
    # than encourage a plausible but unsupported answer.
    return search(org_id, user_message, "INTERNAL", limit=limit)

