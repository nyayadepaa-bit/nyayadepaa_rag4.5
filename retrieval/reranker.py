"""
retrieval/reranker.py
---------------------
Optional cross-encoder reranking for retrieved documents.
Falls back to simple score-based sorting if cross-encoder is unavailable.
"""

import logging

logger = logging.getLogger(__name__)


def rerank(query: str, results: list[dict], top_k: int = 4) -> list[dict]:
    """
    Rerank retrieved results using cross-encoder similarity.
    Falls back to score-based truncation if unavailable.
    """
    try:
        from sentence_transformers import CrossEncoder
        model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        pairs = [(query, r.get("text", "")) for r in results]
        scores = model.predict(pairs)
        for i, score in enumerate(scores):
            results[i]["rerank_score"] = float(score)
        results.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        logger.info(f"[RERANKER] Cross-encoder reranked {len(results)} results.")
    except ImportError:
        logger.info("[RERANKER] sentence-transformers not installed. Using original scores.")
        results.sort(key=lambda x: x.get("score", 0), reverse=True)
    except Exception as e:
        logger.warning(f"[RERANKER] Reranking failed: {e}. Using original scores.")
        results.sort(key=lambda x: x.get("score", 0), reverse=True)

    return results[:top_k]
