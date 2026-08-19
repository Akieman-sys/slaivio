from app.ai.providers.mistral_provider import MistralProvider


_PROVIDERS = {
    "MISTRAL": MistralProvider,
}


def register_provider(name: str, provider_factory):
    """Register a provider without coupling the dialogue engine to its SDK."""
    _PROVIDERS[name.upper()] = provider_factory


def get_provider(provider_name: str):
    factory = _PROVIDERS.get((provider_name or "").upper())
    if not factory:
        raise ValueError(f"Unsupported AI provider: {provider_name}")
    return factory()

