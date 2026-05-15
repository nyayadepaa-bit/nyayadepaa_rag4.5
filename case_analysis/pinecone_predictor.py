"""
case_analysis/pinecone_predictor.py
------------------------------------
Structured prediction engine using Pinecone-retrieved historical cases.
Analyzes case patterns, predicts outcomes, estimates durations, and
provides strategic analysis — all grounded in real Indian case data.
"""

import logging
import json
import re
from collections import Counter, defaultdict
from typing import Optional

logger = logging.getLogger(__name__)


# ── Factor Extraction ─────────────────────────────────────────
# Maps keywords in query/profile to legal factors that influence outcomes
FACTOR_KEYWORDS = {
    "domestic_violence": ["domestic violence", "abuse", "cruelty", "498a", "pwdva", "dv act", "beating", "assault at home"],
    "dowry": ["dowry", "dahej", "demand", "streedhan", "304b", "dowry death", "dowry harassment"],
    "sexual_assault": ["rape", "sexual", "molestation", "376", "pocso", "sexual assault", "indecent"],
    "workplace_harassment": ["posh", "workplace", "sexual harassment at work", "icc", "employer"],
    "maintenance": ["maintenance", "alimony", "125 crpc", "financial support", "wife maintenance"],
    "custody": ["custody", "child", "guardian", "visitation", "parental"],
    "divorce": ["divorce", "separation", "matrimonial", "hindu marriage", "talaq", "annulment"],
    "property": ["property", "inheritance", "succession", "streedhan", "share", "will"],
    "cybercrime": ["cyber", "online", "social media", "stalking", "morphed", "revenge porn"],
    "fir_filed": ["fir", "complaint", "police report", "chargesheet"],
    "evidence_strong": ["evidence", "proof", "medical report", "photograph", "video", "recording", "witness"],
    "appeal": ["appeal", "revision", "review", "appellate"],
}


def _extract_factors(query: str, profile: dict) -> list[str]:
    """Extract legal factors from query and user profile."""
    combined = (
        query.lower() + " " +
        (profile.get("situation_type", "") or "").lower() + " " +
        (profile.get("additional_info", "") or "").lower() + " " +
        (profile.get("evidence", "") or "").lower()
    )

    factors = []
    for factor, keywords in FACTOR_KEYWORDS.items():
        if any(kw in combined for kw in keywords):
            factors.append(factor)

    return factors or ["general_legal"]


def _duration_to_months(duration_dict: dict) -> Optional[float]:
    """Convert a duration dict {years, months, days} to total months."""
    if not duration_dict:
        return None
    years = duration_dict.get("years", 0) or 0
    months = duration_dict.get("months", 0) or 0
    days = duration_dict.get("days", 0) or 0
    total = years * 12 + months + days / 30.0
    return total if total > 0 else None


def _extract_case_metadata(case: dict) -> dict:
    """Extract structured metadata from a retrieved case."""
    meta = case.get("metadata", {})
    text = case.get("text", "")

    # Try to get duration from metadata or text
    duration = None
    if meta.get("duration_years") is not None or meta.get("duration_months") is not None:
        duration = _duration_to_months({
            "years": meta.get("duration_years", 0),
            "months": meta.get("duration_months", 0),
            "days": meta.get("duration_days", 0),
        })

    # Try to extract duration from text
    if duration is None:
        dur_match = re.search(r'(\d+)\s*years?,\s*(\d+)\s*months?,\s*(\d+)\s*days?', text, re.IGNORECASE)
        if dur_match:
            duration = _duration_to_months({
                "years": int(dur_match.group(1)),
                "months": int(dur_match.group(2)),
                "days": int(dur_match.group(3)),
            })

    # Extract outcome
    outcome = meta.get("outcome", meta.get("final_decision", "unknown"))
    if outcome == "unknown" or not outcome:
        for keyword in ["allowed", "dismissed", "disposed", "settled", "acquitted", "convicted"]:
            if keyword in text.lower():
                outcome = keyword.capitalize()
                break

    return {
        "case_id": meta.get("case_id", case.get("id", "N/A")),
        "case_type": meta.get("case_type", "Unknown"),
        "court": meta.get("court", "Unknown"),
        "duration_months": duration,
        "duration_text": meta.get("duration_text", ""),
        "outcome": outcome,
        "decision_logic": meta.get("decision_logic", ""),
        "legal_issues": meta.get("legal_issues", []),
        "score": case.get("score", 0),
    }


class PineconePredictionEngine:
    """
    Structured prediction engine that analyzes Pinecone-retrieved cases
    to generate personalized predictions, duration estimates, and strategic insights.
    """

    def predict(
        self,
        user_query: str,
        retrieved_cases: list[dict],
        user_profile: Optional[dict] = None,
    ) -> dict:
        """
        Run the full prediction pipeline on retrieved cases.

        Returns:
            dict with keys:
                - user_factors: list of detected legal factors
                - outcome_predictions: dict with predictions, top_outcome, top_probability
                - duration_estimate: dict with avg, min, max months and text
                - factor_analysis: list of per-factor breakdowns
                - strategic_analysis: dict with advantages, risks, recommendations
                - judge_reasoning_patterns: dict with reasoning by outcome
                - confidence_score: float 0-1
                - enrichment_context: str (to inject into LLM prompt)
        """
        profile = user_profile or {}

        if not retrieved_cases:
            return self._empty_result(user_query, profile)

        # 1. Extract user's legal factors
        factors = _extract_factors(user_query, profile)

        # 2. Parse all retrieved cases
        parsed_cases = [_extract_case_metadata(c) for c in retrieved_cases]

        # 3. Predict outcomes
        outcome_preds = self._predict_outcomes(parsed_cases, factors)

        # 4. Estimate duration
        duration_est = self._estimate_duration(parsed_cases, factors, profile)

        # 5. Factor-by-factor analysis
        factor_analysis = self._analyze_factors(parsed_cases, factors)

        # 6. Strategic analysis
        strategic = self._strategic_analysis(parsed_cases, factors, profile)

        # 7. Judge reasoning patterns
        judge_reasoning = self._extract_reasoning_patterns(parsed_cases)

        # 8. Confidence score
        confidence = self._compute_confidence(parsed_cases, factors)

        # 9. Build enrichment context for LLM
        enrichment = self._build_enrichment_context(
            factors, outcome_preds, duration_est,
            factor_analysis, strategic, judge_reasoning
        )

        return {
            "user_factors": factors,
            "outcome_predictions": outcome_preds,
            "duration_estimate": duration_est,
            "factor_analysis": factor_analysis,
            "strategic_analysis": strategic,
            "judge_reasoning_patterns": judge_reasoning,
            "confidence_score": round(confidence, 3),
            "enrichment_context": enrichment,
        }

    def _predict_outcomes(self, cases: list[dict], factors: list[str]) -> dict:
        """Predict case outcomes based on similar case distribution."""
        outcomes = Counter()
        for case in cases:
            outcome = case.get("outcome", "Unknown")
            if outcome and outcome != "unknown":
                outcomes[outcome] += 1

        total = sum(outcomes.values()) or 1
        predictions = []
        for outcome, count in outcomes.most_common():
            predictions.append({
                "outcome": outcome,
                "probability": round(count / total * 100, 1),
                "case_count": count,
            })

        return {
            "predictions": predictions,
            "top_outcome": predictions[0]["outcome"] if predictions else "Unknown",
            "top_probability": predictions[0]["probability"] if predictions else 0,
            "total_cases_analyzed": len(cases),
        }

    def _estimate_duration(
        self, cases: list[dict], factors: list[str], profile: dict
    ) -> dict:
        """
        Estimate case duration based on similar cases.
        Applies adjustments for complexity factors.
        """
        durations = [c["duration_months"] for c in cases if c.get("duration_months")]

        if not durations:
            # Generate estimation text based on factors
            return self._heuristic_duration(factors, profile)

        avg = sum(durations) / len(durations)
        min_d = min(durations)
        max_d = max(durations)
        median = sorted(durations)[len(durations) // 2]

        # Apply complexity adjustments
        complexity_factor = 1.0
        if "appeal" in factors:
            complexity_factor *= 1.3
        if len(factors) > 3:
            complexity_factor *= 1.15
        if profile.get("urgency", "").lower().find("planning") >= 0:
            complexity_factor *= 0.9

        adj_avg = avg * complexity_factor
        adj_min = min_d * max(0.8, complexity_factor - 0.2)
        adj_max = max_d * min(1.5, complexity_factor + 0.2)

        # Generate human-readable text
        if adj_avg < 6:
            text = f"Based on {len(durations)} similar cases, expect resolution in approximately {adj_min:.0f} to {adj_max:.0f} months."
        elif adj_avg < 18:
            text = f"Based on {len(durations)} similar cases, this type of matter typically takes {adj_min:.0f} to {adj_max:.0f} months."
        else:
            text = f"Based on {len(durations)} similar cases, anticipate a timeline of {adj_min:.0f} to {adj_max:.0f} months. Court backlog may extend this."

        return {
            "avg_months": round(adj_avg, 1),
            "min_months": round(adj_min, 1),
            "max_months": round(adj_max, 1),
            "median_months": round(median, 1),
            "raw_avg": round(avg, 1),
            "sample_count": len(durations),
            "complexity_factor": round(complexity_factor, 2),
            "estimate_text": text,
        }

    def _heuristic_duration(self, factors: list[str], profile: dict) -> dict:
        """Heuristic duration estimate when no case durations available."""
        # Base estimates by case type (in months)
        type_estimates = {
            "domestic_violence": (6, 18),
            "dowry": (8, 24),
            "sexual_assault": (12, 36),
            "workplace_harassment": (4, 12),
            "maintenance": (3, 12),
            "custody": (6, 24),
            "divorce": (6, 24),
            "property": (12, 36),
            "cybercrime": (4, 18),
            "general_legal": (6, 24),
        }

        all_mins = []
        all_maxs = []
        for f in factors:
            if f in type_estimates:
                all_mins.append(type_estimates[f][0])
                all_maxs.append(type_estimates[f][1])

        if not all_mins:
            all_mins = [6]
            all_maxs = [24]

        min_m = min(all_mins)
        max_m = max(all_maxs)
        avg_m = (min_m + max_m) / 2

        return {
            "avg_months": round(avg_m, 1),
            "min_months": round(min_m, 1),
            "max_months": round(max_m, 1),
            "median_months": round(avg_m, 1),
            "raw_avg": None,
            "sample_count": 0,
            "complexity_factor": 1.0,
            "estimate_text": (
                f"Based on general patterns for {', '.join(factors)}, "
                f"expect approximately {min_m} to {max_m} months. "
                "This is a heuristic estimate — actual duration depends on court load and case specifics."
            ),
        }

    def _analyze_factors(self, cases: list[dict], factors: list[str]) -> list[dict]:
        """Analyze outcome distribution for each detected factor."""
        analysis = []
        for factor in factors:
            matched = [c for c in cases if factor in c.get("case_type", "").lower()
                       or factor.replace("_", " ") in c.get("case_type", "").lower()]
            if not matched:
                matched = cases  # Use all if no direct match

            outcomes = Counter(c.get("outcome", "Unknown") for c in matched)
            dominant = outcomes.most_common(1)[0][0] if outcomes else "Unknown"
            analysis.append({
                "factor": factor,
                "matched_cases": len(matched),
                "dominant_outcome": dominant,
                "outcome_distribution": dict(outcomes),
            })
        return analysis

    def _strategic_analysis(
        self, cases: list[dict], factors: list[str], profile: dict
    ) -> dict:
        """Generate strategic analysis based on case patterns."""
        advantages = []
        risks = []
        recommendations = []

        evidence = profile.get("evidence", "")
        urgency = profile.get("urgency", "")

        # Evidence-based advantages
        if evidence and "no evidence" not in evidence.lower():
            if any(kw in evidence.lower() for kw in ["fir", "police", "complaint"]):
                advantages.append("An FIR/complaint has been filed — this strengthens your legal standing significantly.")
            if any(kw in evidence.lower() for kw in ["medical", "injury", "hospital"]):
                advantages.append("Medical documentation is strong evidence that courts take very seriously.")
            if any(kw in evidence.lower() for kw in ["photo", "video", "recording", "cctv"]):
                advantages.append("Visual/audio evidence provides concrete proof that is difficult to dispute.")
            if any(kw in evidence.lower() for kw in ["whatsapp", "sms", "email", "chat"]):
                advantages.append("Digital communication records can establish a clear timeline of events.")

        # Factor-based risks
        if "appeal" in factors:
            risks.append("Appellate proceedings typically take longer and require stronger legal arguments.")
        if "evidence_strong" not in factors and "fir_filed" not in factors:
            risks.append("Limited documented evidence may weaken your position. Prioritize collecting proof immediately.")

        # Recommendations
        if "fir_filed" not in factors:
            recommendations.append("File an FIR or formal complaint at the earliest — this creates an official record.")
        recommendations.append("Consult a qualified advocate who specializes in women's rights law.")
        if "domestic_violence" in factors or "dowry" in factors:
            recommendations.append("Contact the nearest Protection Officer or Women's Cell for immediate support.")
        if "urgency" in urgency.lower() and "immediate" in urgency.lower():
            recommendations.append("If in immediate danger, call 112 (Emergency) or 181 (Women Helpline) right now.")

        return {
            "advantages": advantages,
            "risks": risks,
            "recommendations": recommendations,
        }

    def _extract_reasoning_patterns(self, cases: list[dict]) -> dict:
        """Extract judicial reasoning patterns from similar cases."""
        reasoning_by_outcome = defaultdict(lambda: {
            "case_count": 0,
            "decision_bases": [],
            "key_laws": [],
            "court_observations": [],
            "common_evidence": [],
        })

        for case in cases:
            outcome = case.get("outcome", "Unknown")
            logic = case.get("decision_logic", "")
            issues = case.get("legal_issues", [])

            reasoning_by_outcome[outcome]["case_count"] += 1

            if logic:
                reasoning_by_outcome[outcome]["decision_bases"].append(logic)

            for issue in issues:
                if issue not in reasoning_by_outcome[outcome]["key_laws"]:
                    reasoning_by_outcome[outcome]["key_laws"].append(issue)

        # Extract top decision bases across all outcomes
        all_bases = []
        for data in reasoning_by_outcome.values():
            all_bases.extend(data["decision_bases"])

        return {
            "reasoning_by_outcome": dict(reasoning_by_outcome),
            "top_decision_bases": list(set(all_bases))[:5],
        }

    def _compute_confidence(self, cases: list[dict], factors: list[str]) -> float:
        """Compute confidence score based on data quality and match count."""
        base = 0.3
        case_bonus = min(0.3, len(cases) * 0.05)
        factor_bonus = min(0.15, len(factors) * 0.05)
        duration_bonus = 0.1 if any(c.get("duration_months") for c in cases) else 0
        outcome_bonus = 0.1 if any(c.get("outcome", "unknown") != "unknown" for c in cases) else 0

        return min(0.95, base + case_bonus + factor_bonus + duration_bonus + outcome_bonus)

    def _build_enrichment_context(
        self, factors, outcomes, duration, factor_analysis, strategic, reasoning
    ) -> str:
        """Build enrichment context string for the LLM prompt."""
        parts = []

        parts.append("━━━ PINECONE PREDICTION ENGINE ANALYSIS ━━━")
        parts.append(f"Detected Legal Factors: {', '.join(factors)}")

        if outcomes.get("predictions"):
            parts.append(f"\nOutcome Predictions:")
            for p in outcomes["predictions"][:3]:
                parts.append(f"  - {p['outcome']}: {p['probability']}% ({p['case_count']} cases)")

        if duration.get("avg_months"):
            parts.append(f"\nDuration Estimate: {duration['min_months']:.0f}-{duration['max_months']:.0f} months "
                        f"(avg: {duration['avg_months']:.0f}, sample: {duration['sample_count']})")

        if strategic.get("advantages"):
            parts.append(f"\nStrategic Advantages:")
            for a in strategic["advantages"]:
                parts.append(f"  - {a}")

        if reasoning.get("top_decision_bases"):
            parts.append(f"\nJudge Reasoning Patterns: {', '.join(reasoning['top_decision_bases'][:3])}")

        parts.append("━━━ END PREDICTION ENGINE ANALYSIS ━━━")
        return "\n".join(parts)

    def _empty_result(self, query: str, profile: dict) -> dict:
        """Return empty prediction when no cases available."""
        factors = _extract_factors(query, profile)
        duration = self._heuristic_duration(factors, profile)
        return {
            "user_factors": factors,
            "outcome_predictions": {"predictions": [], "top_outcome": "Unknown", "top_probability": 0},
            "duration_estimate": duration,
            "factor_analysis": [],
            "strategic_analysis": {"advantages": [], "risks": [], "recommendations": []},
            "judge_reasoning_patterns": {"reasoning_by_outcome": {}, "top_decision_bases": []},
            "confidence_score": 0.2,
            "enrichment_context": "",
            "error": "No retrieved cases available for prediction.",
        }
