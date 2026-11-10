# services/agent/one_shot.py
"""
One prompt in, text out, using whichever model the trader configured as their
default in /agent - including a local Ollama model, with no API key needed.

Everything else in services/agent/ is wired for the interactive, streamed chat
agent (agno-wrapped, services/agent/stream.py). This is the minimal pattern
underneath it, following blueprints/agent.py's test_model() route (the only
other place that calls LiteLLM directly for a single answer rather than a
chat turn): resolve the configured model, build its LiteLLM kwargs, stream a
completion and drain it.

Best-effort by contract: every failure (no default model configured, a local
Ollama that isn't running, a timeout, a provider error) is caught and logged,
returning None. A caller here (services/trade_reasoning_service.py) must never
have an EOD job or a page request fail because a model could not be reached.
"""

from utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_TIMEOUT_SECONDS = 45


def generate_text(prompt: str, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> str | None:
    """The default model's answer to ``prompt``, or None if it could not be reached."""
    from services.agent import builder, litellm_loader
    from services.agent.builder import AgentBuildError
    from services.agent.providers import litellm_kwargs

    try:
        resolved = builder.resolve_model(None)
    except AgentBuildError as exc:
        logger.warning(f"Could not resolve a default agent model for one-shot use: {exc}")
        return None

    try:
        # Idempotent; registers the extra ChatGPT-subscription models this
        # module's own resolve_model() call might otherwise not recognise, the
        # same safety margin blueprints/agent.py's test route carries.
        builder._register_chatgpt_models()

        from database import agent_db

        api_key, _secret_name = agent_db.resolve_api_key(resolved.id, resolved.provider_kind)
        call_kwargs = litellm_kwargs(resolved, api_key)

        litellm = litellm_loader.load()

        # Streamed, never a plain completion: LiteLLM's non-streaming reader
        # is broken for some providers (see blueprints/agent.py's test route,
        # which hit this with a ChatGPT-subscription model), and this agent
        # only ever runs stream=True in production anyway.
        stream = litellm.completion(
            model=call_kwargs["id"],
            messages=[{"role": "user", "content": prompt}],
            timeout=timeout,
            num_retries=0,
            stream=True,
            api_key=call_kwargs.get("api_key"),
            api_base=call_kwargs.get("api_base"),
        )
        chunks = []
        for piece in stream:
            delta = piece.choices[0].delta.content if piece.choices else None
            if delta:
                chunks.append(delta)
        text = "".join(chunks).strip()
        return text or None
    except Exception as exc:
        logger.warning(f"One-shot generation with {resolved.display_name} failed: {exc}")
        return None
