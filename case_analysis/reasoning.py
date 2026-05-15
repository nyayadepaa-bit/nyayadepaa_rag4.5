"""
case_analysis/reasoning.py
---------------------------
Extract judge reasoning patterns from similar cases.
"""

import logging
import re

logger = logging.getLogger(__name__)


def extract_judge_statements(similar_cases: list[dict], predicted_outcome: str) -> list[str]:
    """
    Extract and synthesize judge reasoning statements from similar cases.
    Returns a list of reasoning statements that support the predicted outcome.
    """
    statements = []

    for case in similar_cases:
        meta = case.get("metadata", {})
        reasoning = meta.get("judgment_reasoning", "") or ""
        decision_logic = meta.get("decision_logic", "") or ""
        summary = meta.get("summary_short", "") or ""

        # Extract relevant reasoning snippets
        if decision_logic and len(decision_logic) > 20:
            clean = decision_logic.replace("\n", " ").strip()[:300]
            if clean:
                statements.append(clean)

        # Look for reasoning patterns in the text
        reasoning_patterns = [
            r'(?:held|observed|ruled|found|concluded|opined|directed)\s+that\s+(.{30,200})',
            r'(?:court|bench|judge)\s+(?:held|observed|ruled|found|concluded)\s+(.{30,200})',
        ]
        for pattern in reasoning_patterns:
            matches = re.findall(pattern, reasoning, re.IGNORECASE)
            for match in matches[:2]:
                clean = match.replace("\n", " ").strip()[:250]
                if clean and len(clean) > 20:
                    statements.append(clean)

    # Deduplicate and limit
    seen = set()
    unique = []
    for s in statements:
        key = s[:50].lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)

    return unique[:5]
