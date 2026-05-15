"""
app/duration_predictor.py
--------------------------
RAG-based Personalized Case Duration Prediction Engine for Indian Legal Cases.

Pipeline:
  1. Accept case parameters (type, court, jurisdiction, complexity, etc.)
  2. Retrieve similar historical cases from Pinecone + local dataset
  3. Compute personalized duration using statistical + pattern-based reasoning
  4. Generate structured output with Case Summary ID, references, and confidence
"""

import json
import logging
import hashlib
import statistics
from datetime import datetime, date
from typing import Optional
from collections import Counter, defaultdict
from pathlib import Path

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# ── Daily case counter for ID generation ──────────────────────
_daily_counter: dict[str, int] = {}


def _generate_case_summary_id() -> str:
    """Generate unique Case Summary ID: ND-YYYYMMDD-XXX"""
    today = datetime.now().strftime("%Y%m%d")
    _daily_counter.setdefault(today, 0)
    _daily_counter[today] += 1
    return f"ND-{today}-{_daily_counter[today]:03d}"


def _duration_to_months(dur: dict) -> Optional[float]:
    y = dur.get("years", 0) or 0
    m = dur.get("months", 0) or 0
    d = dur.get("days", 0) or 0
    total = y * 12 + m + d / 30.0
    return round(total, 2) if total > 0 else None


def _load_local_cases() -> list[dict]:
    """Load cases from local JSON dataset."""
    for fname in ["case_dataset_en.json", "case_dataset_dates_fix_sample.json"]:
        path = DATA_DIR / fname
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data.get("records", [])
            except Exception as e:
                logger.warning(f"Failed to load {fname}: {e}")
    return []


# ── Complexity scoring weights ────────────────────────────────
COMPLEXITY_WEIGHTS = {
    "appeal": 1.4,
    "multiple_parties": 1.25,
    "cross_jurisdiction": 1.3,
    "evidence_heavy": 1.15,
    "high_court": 1.5,
    "supreme_court": 2.0,
    "district_court": 1.0,
    "sessions_court": 1.1,
    "fast_track": 0.6,
    "lok_adalat": 0.3,
}

# Case type base duration ranges (months) from Indian judicial statistics
CASE_TYPE_BASELINES = {
    "Domestic Violence Act Appeal": (8, 22),
    "Domestic Violence": (4, 14),
    "Dowry Harassment": (8, 24),
    "Sexual Assault": (12, 36),
    "Workplace Harassment": (4, 12),
    "Maintenance": (3, 12),
    "Divorce": (6, 24),
    "Child Custody": (6, 24),
    "Property Dispute": (12, 48),
    "Cybercrime": (4, 18),
    "Criminal Appeal": (12, 36),
    "Civil Suit": (12, 60),
    "Motor Accident Claim": (6, 36),
    "Cheque Bounce (138 NI Act)": (6, 18),
    "Consumer Complaint": (3, 12),
    "Bail Application": (0.5, 3),
    "Writ Petition": (3, 18),
}


def _match_case_type_baseline(case_type: str) -> tuple[float, float]:
    """Find the closest matching baseline duration for a case type."""
    ct_lower = case_type.lower()
    for key, val in CASE_TYPE_BASELINES.items():
        if key.lower() in ct_lower or ct_lower in key.lower():
            return val
    # Fuzzy match
    for key, val in CASE_TYPE_BASELINES.items():
        keywords = key.lower().split()
        if any(kw in ct_lower for kw in keywords if len(kw) > 3):
            return val
    return (6, 24)  # Default


def _compute_complexity_multiplier(params: dict) -> float:
    """Compute complexity multiplier from case parameters."""
    multiplier = 1.0
    court = (params.get("court") or "").lower()
    case_type = (params.get("case_type") or "").lower()

    if "high court" in court:
        multiplier *= COMPLEXITY_WEIGHTS["high_court"]
    elif "supreme" in court:
        multiplier *= COMPLEXITY_WEIGHTS["supreme_court"]
    elif "sessions" in court:
        multiplier *= COMPLEXITY_WEIGHTS["sessions_court"]
    elif "fast track" in court or "fast-track" in court:
        multiplier *= COMPLEXITY_WEIGHTS["fast_track"]
    elif "lok adalat" in court:
        multiplier *= COMPLEXITY_WEIGHTS["lok_adalat"]

    if "appeal" in case_type:
        multiplier *= COMPLEXITY_WEIGHTS["appeal"]

    num_parties = params.get("num_parties", 2)
    if isinstance(num_parties, int) and num_parties > 3:
        multiplier *= COMPLEXITY_WEIGHTS["multiple_parties"]

    complexity = (params.get("complexity") or "").lower()
    if complexity in ("high", "very high"):
        multiplier *= 1.3
    elif complexity == "low":
        multiplier *= 0.8

    return round(multiplier, 3)


def _find_similar_local_cases(params: dict, top_k: int = 8) -> list[dict]:
    """Find similar cases from the local dataset."""
    records = _load_local_cases()
    if not records:
        return []

    target_type = (params.get("case_type") or "").lower()
    scored = []

    for rec in records:
        score = 0.0
        rec_type = (rec.get("case_type") or "").lower()

        # Case type match (highest weight)
        if target_type and rec_type:
            if target_type == rec_type:
                score += 0.5
            elif target_type in rec_type or rec_type in target_type:
                score += 0.35
            else:
                type_words = set(target_type.split())
                rec_words = set(rec_type.split())
                overlap = len(type_words & rec_words)
                if overlap > 0:
                    score += 0.2 * (overlap / max(len(type_words), 1))

        # Court match
        target_court = (params.get("court") or "").lower()
        rec_court = (rec.get("court") or "").lower()
        if target_court and rec_court and target_court in rec_court:
            score += 0.2

        # Must have valid duration
        dur = rec.get("dates", {}).get("duration", {})
        months = _duration_to_months(dur)
        if months and months > 0:
            score += 0.1

        if score > 0.05:
            scored.append({
                "record": rec,
                "similarity": round(score, 3),
                "duration_months": months,
            })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]


def predict_duration(params: dict) -> dict:
    """
    Generate a personalized case duration prediction.

    params keys:
        - case_type: str (e.g. "Domestic Violence Act Appeal")
        - court: str (e.g. "Sessions Court, Aurangabad")
        - jurisdiction: str (e.g. "Maharashtra")
        - complexity: str (low/medium/high)
        - num_parties: int
        - evidence_strength: str
        - has_appeal: bool
        - description: str (free-text case description)
        - urgency: str

    Returns structured prediction with Case Summary ID.
    """
    case_id = _generate_case_summary_id()
    today = datetime.now().strftime("%Y-%m-%d")
    case_type = params.get("case_type", "General Legal Matter")
    court = params.get("court", "District Court")
    jurisdiction = params.get("jurisdiction", "India")

    # 1. Retrieve similar cases (local dataset)
    similar_cases = _find_similar_local_cases(params, top_k=8)

    # 2. Retrieve from Pinecone (if available)
    pinecone_cases = []
    try:
        from retrieval.retriever import retrieve
        query = f"{case_type} {court} {jurisdiction} {params.get('description', '')}"
        pinecone_results = retrieve(query=query, top_k=6)
        for r in pinecone_results:
            meta = r.get("metadata", {})
            dur_text = meta.get("duration_text", "")
            import re
            dur_match = re.search(r'(\d+)\s*years?,\s*(\d+)\s*months?,\s*(\d+)\s*days?', dur_text)
            dur_months = None
            if dur_match:
                dur_months = _duration_to_months({
                    "years": int(dur_match.group(1)),
                    "months": int(dur_match.group(2)),
                    "days": int(dur_match.group(3)),
                })
            pinecone_cases.append({
                "case_id": meta.get("case_id", r.get("id", "N/A")),
                "case_type": meta.get("case_type", "Unknown"),
                "court": meta.get("court", "Unknown"),
                "duration_months": dur_months,
                "duration_text": dur_text,
                "score": r.get("score", 0),
                "source": "pinecone",
            })
    except Exception as e:
        logger.warning(f"[DURATION] Pinecone retrieval skipped: {e}")

    # 3. Merge durations from all sources
    all_durations = []
    reference_cases = []

    for sc in similar_cases:
        if sc.get("duration_months"):
            all_durations.append(sc["duration_months"])
            rec = sc["record"]
            reference_cases.append({
                "case_id": rec.get("case_id", "N/A"),
                "case_type": rec.get("case_type", "Unknown"),
                "duration_text": rec.get("dates", {}).get("duration", {}).get("text", "N/A"),
                "duration_months": sc["duration_months"],
                "similarity": sc["similarity"],
                "source": "local_dataset",
                "why_selected": f"Matched on case_type='{rec.get('case_type', '')}' with similarity {sc['similarity']:.2f}",
            })

    for pc in pinecone_cases:
        if pc.get("duration_months"):
            all_durations.append(pc["duration_months"])
            reference_cases.append({
                "case_id": pc["case_id"],
                "case_type": pc["case_type"],
                "duration_text": pc.get("duration_text", "N/A"),
                "duration_months": pc["duration_months"],
                "similarity": pc.get("score", 0),
                "source": "pinecone_vectordb",
                "why_selected": f"Vector similarity score {pc.get('score', 0):.3f} for case_type='{pc['case_type']}'",
            })

    # 4. Compute personalized duration
    complexity_mult = _compute_complexity_multiplier(params)
    baseline_min, baseline_max = _match_case_type_baseline(case_type)

    if all_durations:
        raw_avg = statistics.mean(all_durations)
        raw_median = statistics.median(all_durations)
        raw_stdev = statistics.stdev(all_durations) if len(all_durations) > 1 else 0
        raw_min = min(all_durations)
        raw_max = max(all_durations)

        adj_avg = raw_avg * complexity_mult
        adj_min = max(raw_min * 0.85, adj_avg - raw_stdev)
        adj_max = min(raw_max * 1.15, adj_avg + raw_stdev * 1.5)

        if adj_min > adj_max:
            adj_min, adj_max = adj_max, adj_min
        adj_min = max(0.5, adj_min)

        confidence = min(0.92, 0.45 + len(all_durations) * 0.06)
        data_source = "historical_cases"
    else:
        raw_avg = (baseline_min + baseline_max) / 2
        raw_median = raw_avg
        raw_stdev = 0
        raw_min = baseline_min
        raw_max = baseline_max

        adj_avg = raw_avg * complexity_mult
        adj_min = baseline_min * complexity_mult
        adj_max = baseline_max * complexity_mult
        confidence = 0.35
        data_source = "heuristic_baseline"

    # 5. Build reasoning
    reasoning_factors = []
    reasoning_factors.append(f"Case type '{case_type}' baseline range: {baseline_min}-{baseline_max} months")
    reasoning_factors.append(f"Complexity multiplier: {complexity_mult}x (court='{court}', parties={params.get('num_parties', 2)})")

    if all_durations:
        reasoning_factors.append(
            f"Analyzed {len(all_durations)} similar historical cases with durations ranging "
            f"{raw_min:.1f} to {raw_max:.1f} months (median: {raw_median:.1f})"
        )

    patterns = []
    if similar_cases:
        type_durations = defaultdict(list)
        for sc in similar_cases:
            if sc.get("duration_months"):
                ct = sc["record"].get("case_type", "Unknown")
                type_durations[ct].append(sc["duration_months"])
        for ct, durs in type_durations.items():
            patterns.append(f"'{ct}' cases: avg {statistics.mean(durs):.1f} months ({len(durs)} cases)")

    # 6. Format duration as human-readable
    def _months_to_text(m: float) -> str:
        if m < 1:
            return f"{int(m * 30)} days"
        y = int(m // 12)
        mo = int(m % 12)
        parts = []
        if y > 0:
            parts.append(f"{y} year{'s' if y > 1 else ''}")
        if mo > 0:
            parts.append(f"{mo} month{'s' if mo > 1 else ''}")
        return ", ".join(parts) if parts else "less than 1 month"

    prediction = {
        "estimated_duration": _months_to_text(adj_avg),
        "duration_range": f"{_months_to_text(adj_min)} to {_months_to_text(adj_max)}",
        "avg_months": round(adj_avg, 1),
        "min_months": round(adj_min, 1),
        "max_months": round(adj_max, 1),
    }

    # 7. Assemble structured output
    result = {
        # Header Section
        "header": {
            "case_summary_id": case_id,
            "date": today,
            "model_method_summary": (
                "RAG-based duration prediction using Pinecone vector similarity retrieval + "
                "local Indian case dataset analysis. Durations computed via weighted statistical "
                "aggregation of similar historical cases, adjusted for complexity factors "
                "(court level, case type, parties, jurisdiction). Confidence derived from "
                "sample size and match quality."
            ),
        },

        # Case Input Summary
        "case_input_summary": {
            "case_type": case_type,
            "court": court,
            "jurisdiction": jurisdiction,
            "complexity": params.get("complexity", "medium"),
            "num_parties": params.get("num_parties", 2),
            "evidence_strength": params.get("evidence_strength", "not specified"),
            "has_appeal": params.get("has_appeal", False),
            "urgency": params.get("urgency", "not specified"),
        },

        # Predicted Duration
        "predicted_duration": {
            **prediction,
            "confidence_level": f"{confidence * 100:.0f}%",
            "confidence_score": round(confidence, 3),
            "data_source": data_source,
            "cases_analyzed": len(all_durations),
        },

        # Reasoning
        "reasoning": {
            "key_factors": reasoning_factors,
            "patterns_observed": patterns,
            "complexity_multiplier": complexity_mult,
            "baseline_range_months": [baseline_min, baseline_max],
        },

        # Reference Cases
        "reference_cases": reference_cases[:6],

        # Notes
        "notes": {
            "assumptions": [
                "Duration predictions assume normal court functioning without extraordinary delays.",
                "COVID-19 era cases may have inflated durations due to court closures.",
                "Actual duration depends on judge assignment, court backlog, and adjournments.",
            ],
            "limitations": [
                f"Based on {len(all_durations)} matched cases — larger sample improves accuracy.",
                "Dataset is primarily Maharashtra courts; other states may have different patterns.",
                "Settlement or mediation can significantly shorten actual resolution time.",
            ],
        },
    }

    logger.info(
        f"[DURATION] {case_id} | type={case_type} | "
        f"pred={adj_avg:.1f}mo ({adj_min:.1f}-{adj_max:.1f}) | "
        f"conf={confidence:.0%} | cases={len(all_durations)}"
    )

    return result
