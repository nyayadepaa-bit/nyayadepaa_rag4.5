"""
case_analysis/analyzer.py
--------------------------
Case analysis pipeline using local JSON dataset.
Finds similar cases by case_type, court, and facts.
Used as fallback when Pinecone is unavailable.
"""

import json
import logging
import re
from pathlib import Path
from collections import Counter
from typing import Optional

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CASE_DATASET_EN = DATA_DIR / "case_dataset_en.json"
CASE_DATASET_SAMPLE = DATA_DIR / "case_dataset_dates_fix_sample.json"


def _load_dataset() -> list[dict]:
    """Load the case dataset from JSON file."""
    for path in [CASE_DATASET_EN, CASE_DATASET_SAMPLE]:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                records = data.get("records", [])
                logger.info(f"[ANALYZER] Loaded {len(records)} records from {path.name}")
                return records
            except Exception as e:
                logger.warning(f"[ANALYZER] Failed to load {path}: {e}")
    logger.warning("[ANALYZER] No dataset file found.")
    return []


def _tokenize(text: str) -> set[str]:
    """Simple word tokenization for similarity matching."""
    return set(re.findall(r'\b[a-zA-Z]{3,}\b', text.lower()))


def _compute_similarity(query_tokens: set, case_record: dict) -> float:
    """Compute a simple Jaccard-like similarity between query and case."""
    case_text = " ".join([
        case_record.get("case_type", ""),
        case_record.get("facts", "")[:500],
        case_record.get("case_summary", {}).get("summary_short", ""),
    ]).lower()
    case_tokens = _tokenize(case_text)
    if not case_tokens or not query_tokens:
        return 0.0
    intersection = query_tokens & case_tokens
    union = query_tokens | case_tokens
    return len(intersection) / len(union) if union else 0.0


class CasePipeline:
    """
    Fallback case analysis pipeline using the local JSON dataset.
    Used when Pinecone/ChromaDB is unavailable.
    """

    def __init__(self):
        self._records = None

    @property
    def records(self):
        if self._records is None:
            self._records = _load_dataset()
        return self._records

    def analyze(self, user_description: str, top_k: int = 5) -> dict:
        """
        Analyze a user's case description against historical data.
        Returns similar cases, predicted outcomes, and duration estimates.
        """
        query_tokens = _tokenize(user_description)
        if not query_tokens:
            return {"similar_cases": [], "outcome_predictions": {"predictions": []}}

        scored = []
        for record in self.records:
            sim = _compute_similarity(query_tokens, record)
            if sim > 0.01:
                scored.append((sim, record))

        scored.sort(key=lambda x: x[0], reverse=True)
        top_cases = scored[:top_k]

        # Analyze outcomes
        outcomes = Counter()
        durations = []

        for sim, case in top_cases:
            outcome = case.get("case_summary", {}).get("outcome", {}).get("final_decision", "Unknown")
            outcomes[outcome] += 1

            dur = case.get("dates", {}).get("duration", {})
            if dur:
                total_months = dur.get("years", 0) * 12 + dur.get("months", 0) + dur.get("days", 0) / 30.0
                if total_months > 0:
                    durations.append(total_months)

        predictions = []
        total = sum(outcomes.values()) or 1
        for outcome, count in outcomes.most_common():
            predictions.append({
                "outcome": outcome,
                "probability": round(count / total * 100, 1),
                "case_count": count,
            })

        return {
            "similar_cases": [
                {
                    "case_id": case.get("case_id", "N/A"),
                    "case_type": case.get("case_type", "Unknown"),
                    "duration": case.get("dates", {}).get("duration", {}).get("text", "N/A"),
                    "similarity": round(sim, 3),
                }
                for sim, case in top_cases
            ],
            "outcome_predictions": {
                "predictions": predictions,
                "top_outcome": predictions[0]["outcome"] if predictions else "Unknown",
                "top_probability": predictions[0]["probability"] if predictions else 0,
            },
            "duration_stats": {
                "avg_months": round(sum(durations) / len(durations), 1) if durations else None,
                "min_months": round(min(durations), 1) if durations else None,
                "max_months": round(max(durations), 1) if durations else None,
                "sample_count": len(durations),
            },
            "confidence_score": round(min(0.9, 0.3 + len(top_cases) * 0.12), 2),
        }
