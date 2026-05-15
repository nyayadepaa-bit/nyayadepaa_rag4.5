"""
retrieval/retriever.py
-----------------------
Retrieves relevant legal case documents from Pinecone vector DB
using Jina embeddings for similarity search.
"""

import logging
import requests
from typing import Optional

from app.config import (
    PINECONE_API_KEY, PINECONE_INDEX_NAME,
    JINA_API_KEY, JINA_MODEL,
    TOP_K_RETRIEVE, EMBEDDING_DIM,
    LEGAL_NAMESPACES,
)

logger = logging.getLogger(__name__)

# ── Pinecone Client ──────────────────────────────────────────
_pinecone_index = None

def _get_pinecone_index():
    """Lazy-initialize Pinecone index."""
    global _pinecone_index
    if _pinecone_index is None and PINECONE_API_KEY:
        try:
            from pinecone import Pinecone
            pc = Pinecone(api_key=PINECONE_API_KEY)
            _pinecone_index = pc.Index(PINECONE_INDEX_NAME)
            logger.info(f"[RETRIEVER] Pinecone index '{PINECONE_INDEX_NAME}' connected.")
        except Exception as e:
            logger.error(f"[RETRIEVER] Pinecone connection failed: {e}")
    return _pinecone_index


def _embed_text(text: str) -> list[float]:
    """Generate embedding vector using Jina API."""
    if not JINA_API_KEY:
        raise RuntimeError("JINA_API_KEY not configured.")

    response = requests.post(
        "https://api.jina.ai/v1/embeddings",
        headers={
            "Authorization": f"Bearer {JINA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": JINA_MODEL,
            "input": [text],
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return data["data"][0]["embedding"]


def retrieve(
    query: str,
    namespaces: Optional[list[str]] = None,
    top_k: int = TOP_K_RETRIEVE,
    use_mmr: bool = False,
) -> list[dict]:
    """
    Retrieve relevant case documents from Pinecone.

    Returns a list of dicts with keys:
        - id: str
        - score: float
        - metadata: dict (case_type, court, duration, etc.)
        - text: str (the chunk content)
    """
    index = _get_pinecone_index()
    if not index:
        logger.warning("[RETRIEVER] No Pinecone index available. Returning empty results.")
        return []

    try:
        vector = _embed_text(query)
    except Exception as e:
        logger.error(f"[RETRIEVER] Embedding failed: {e}")
        return []

    ns_list = namespaces or LEGAL_NAMESPACES
    all_results = []

    for ns in ns_list:
        try:
            response = index.query(
                vector=vector,
                top_k=top_k,
                namespace=ns,
                include_metadata=True,
            )
            for match in response.get("matches", []):
                all_results.append({
                    "id": match["id"],
                    "score": match.get("score", 0.0),
                    "metadata": match.get("metadata", {}),
                    "text": match.get("metadata", {}).get("text", ""),
                    "namespace": ns,
                })
        except Exception as e:
            logger.warning(f"[RETRIEVER] Query failed for namespace '{ns}': {e}")
            continue

    # Sort by relevance score descending
    all_results.sort(key=lambda x: x["score"], reverse=True)

    # Deduplicate by ID
    seen_ids = set()
    deduped = []
    for r in all_results:
        if r["id"] not in seen_ids:
            seen_ids.add(r["id"])
            deduped.append(r)

    return deduped[:top_k]


def format_context(results: list[dict], max_chars: int = 4000) -> str:
    """Format retrieved results into a context string for the LLM."""
    if not results:
        return "No matching case precedents found."

    context_parts = []
    char_count = 0

    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        text = r.get("text", "")
        score = r.get("score", 0)

        # Build a structured context entry
        entry = f"--- PRECEDENT #{i} (relevance: {score:.3f}) ---\n"
        if meta.get("case_type"):
            entry += f"Case Type: {meta['case_type']}\n"
        if meta.get("court"):
            entry += f"Court: {meta['court']}\n"
        if meta.get("duration_text"):
            entry += f"Duration: {meta['duration_text']}\n"
        if meta.get("outcome"):
            entry += f"Outcome: {meta['outcome']}\n"
        if text:
            entry += f"Content: {text[:600]}\n"

        if char_count + len(entry) > max_chars:
            break
        context_parts.append(entry)
        char_count += len(entry)

    return "\n".join(context_parts)
