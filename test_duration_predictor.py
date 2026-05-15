"""
test_duration_predictor.py
---------------------------
End-to-end test for the RAG-based case duration prediction system.
"""

import json
import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.duration_predictor import predict_duration


def test_case(name, params):
    print(f"\n{'='*70}")
    print(f"  TEST: {name}")
    print(f"{'='*70}")

    result = predict_duration(params)

    assert "header" in result
    assert result["header"]["case_summary_id"].startswith("ND-")
    assert "predicted_duration" in result
    assert "reasoning" in result
    assert "reference_cases" in result

    h = result["header"]
    print(f"\n  Case Summary ID: {h['case_summary_id']}")
    print(f"  Date: {h['date']}")

    inp = result["case_input_summary"]
    print(f"\n  INPUT: {inp['case_type']} | {inp['court']} | {inp['jurisdiction']}")

    pred = result["predicted_duration"]
    print(f"\n  PREDICTED DURATION: {pred['estimated_duration']}")
    print(f"  Range: {pred['duration_range']}")
    print(f"  Confidence: {pred['confidence_level']}")
    print(f"  Cases analyzed: {pred['cases_analyzed']}")
    print(f"  Data source: {pred['data_source']}")

    reas = result["reasoning"]
    print(f"\n  REASONING:")
    for f in reas["key_factors"]:
        print(f"   - {f}")

    refs = result["reference_cases"]
    if refs:
        print(f"\n  REFERENCE CASES ({len(refs)}):")
        for ref in refs[:3]:
            print(f"   [{ref['source']}] {ref['case_type']} | Dur: {ref['duration_text']} | Sim: {ref['similarity']}")

    return result


def main():
    print("=" * 70)
    print("  CASE DURATION PREDICTION SYSTEM - TEST SUITE")
    print("=" * 70)

    results = []

    r1 = test_case("DV Appeal - Sessions Court, Maharashtra", {
        "case_type": "Domestic Violence Act Appeal",
        "court": "Sessions Court, Aurangabad",
        "jurisdiction": "Maharashtra",
        "complexity": "medium",
        "num_parties": 3,
        "evidence_strength": "moderate",
        "has_appeal": True,
        "description": "Appeal under PWDVA 2005, Section 29",
    })
    results.append(r1)

    r2 = test_case("Dowry Harassment - District Court, Delhi", {
        "case_type": "Dowry Harassment",
        "court": "District Court, Patiala House",
        "jurisdiction": "Delhi",
        "complexity": "high",
        "num_parties": 5,
        "evidence_strength": "strong",
        "has_appeal": False,
        "description": "Dowry demand with abuse. FIR under 498A IPC.",
    })
    results.append(r2)

    r3 = test_case("Bail Application - Fast Track", {
        "case_type": "Bail Application",
        "court": "Fast Track Court",
        "jurisdiction": "Karnataka",
        "complexity": "low",
        "num_parties": 2,
    })
    results.append(r3)

    r4 = test_case("Property Dispute - High Court", {
        "case_type": "Property Dispute",
        "court": "High Court, Bombay",
        "jurisdiction": "Maharashtra",
        "complexity": "very high",
        "num_parties": 8,
        "has_appeal": True,
    })
    results.append(r4)

    # Validation
    print(f"\n{'='*70}")
    print("  VALIDATION")
    print(f"{'='*70}")

    durations = [r["predicted_duration"]["avg_months"] for r in results]
    print(f"\n  Durations (months): {durations}")
    print(f"  All unique: {'PASS' if len(set(durations)) == len(durations) else 'FAIL'}")

    ids = [r["header"]["case_summary_id"] for r in results]
    print(f"  IDs: {ids}")
    id_pattern = re.compile(r'^ND-\d{8}-\d{3}$')
    for cid in ids:
        valid = bool(id_pattern.match(cid))
        print(f"  ID '{cid}' format: {'PASS' if valid else 'FAIL'}")

    if durations[2] < durations[0] < durations[3]:
        print(f"  Ordering (bail < DV < property): PASS")
    else:
        print(f"  Ordering: WARN - may need tuning")

    print(f"\n  {len(results)} tests completed.\n")


if __name__ == "__main__":
    main()
