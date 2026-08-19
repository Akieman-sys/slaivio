import re
import unicodedata


UNKNOWN_ANSWERS = {
    "je ne sais pas", "je sais pas", "aucune idee", "aucune idée", "inconnu",
    "pas encore", "a confirmer", "à confirmer", "non renseigne", "non renseigné",
}
GREETINGS = {"salut", "bonjour", "bonsoir", "hello", "hi", "coucou", "tu es la", "tu es là"}
CANCEL_WORDS = {"annule", "annuler", "abandonne", "abandonner", "laisse tomber"}
PAUSE_WORDS = {"pause", "mets en pause", "on reprend plus tard", "reprendre plus tard"}
RESUME_WORDS = {"reprends", "reprendre", "continue", "on continue"}


def normalize_text(value: str) -> str:
    compact = " ".join((value or "").strip().lower().split())
    return "".join(
        char for char in unicodedata.normalize("NFKD", compact)
        if not unicodedata.combining(char)
    )


def dialogue_act(message: str, active_workflow: bool = False) -> str:
    value = normalize_text(message).strip(" ?.!")
    if value in {normalize_text(x) for x in GREETINGS}:
        return "GREETING"
    if value in {normalize_text(x) for x in CANCEL_WORDS} or any(value.endswith(" "+normalize_text(x)) for x in CANCEL_WORDS):
        return "CANCEL"
    if value in {normalize_text(x) for x in PAUSE_WORDS}:
        return "PAUSE"
    if value in {normalize_text(x) for x in RESUME_WORDS}:
        return "RESUME"
    if re.match(r"^(corrige|remplace|modifie)\b", value):
        return "CORRECTION"
    if any(term in value for term in ("n'est pas cree", "n est pas cree", "pas ete cree", "ou en est")):
        return "STATUS_QUESTION"
    if value in {normalize_text(x) for x in UNKNOWN_ANSWERS}:
        return "UNKNOWN_ANSWER"
    return "FIELD_ANSWER" if active_workflow else "NEW_REQUEST"


def validate_field(field: str, raw_value: str) -> dict:
    value = " ".join((raw_value or "").strip().split())
    normalized = normalize_text(value)
    if not value or normalized in {normalize_text(x) for x in UNKNOWN_ANSWERS}:
        return {"status": "UNKNOWN", "value": None, "reason": "information_inconnue"}
    if field == "client_phone":
        match = re.fullmatch(r"\+?[0-9][0-9\s().-]{6,18}[0-9]", value)
        if not match:
            return {"status": "INVALID", "value": None, "reason": "numero_whatsapp_invalide"}
        phone = re.sub(r"[^0-9+]", "", value)
        return {"status": "VALID", "value": phone, "reason": None}
    if field == "client_name":
        if len(value) < 2 or any(char.isdigit() for char in value):
            return {"status": "INVALID", "value": None, "reason": "nom_client_invalide"}
    if field in {"origin_country", "destination_city"}:
        if len(value) < 2 or any(char.isdigit() for char in value):
            return {"status": "INVALID", "value": None, "reason": "lieu_invalide"}
    if field == "goods_type":
        off_topic = ("maison", "emploi", "mariage", "politique", "vendre ma", "acheter une voiture")
        if len(value) < 2 or any(term in normalized for term in off_topic):
            return {"status": "INVALID", "value": None, "reason": "marchandise_hors_contexte"}
    return {"status": "VALID", "value": value, "reason": None}


def correction_from_message(message: str) -> tuple[str | None, str | None]:
    value = " ".join(message.strip().split())
    patterns = (
        ("destination_city", r"(?:destination|ville|kinshasa)\s+(?:en|par|a|à)\s+([\wÀ-ÿ -]+)$"),
        ("origin_country", r"(?:origine|pays)\s+(?:en|par|a|à)\s+([\wÀ-ÿ -]+)$"),
        ("goods_type", r"(?:contenu|marchandise|produit)\s+(?:en|par|a|à)\s+(.+)$"),
    )
    for field, pattern in patterns:
        match = re.search(pattern, value, re.IGNORECASE)
        if match:
            return field, match.group(1).strip(" .")
    match = re.match(r"(?:corrige|remplace|modifie)\s+(.+?)\s+(?:en|par)\s+(.+)$", value, re.IGNORECASE)
    if match:
        old, new = normalize_text(match.group(1)), match.group(2).strip()
        if old in {"kinshasa", "goma", "douala", "destination", "ville"}:
            return "destination_city", new
    return None, None
