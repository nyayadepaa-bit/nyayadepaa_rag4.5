"""
RAG-style conversational legal intake and case analysis workflow.

Implements a two-phase system:
  Phase 1 — Information Gathering: Conversational extraction of case facts
             with an internal completeness checklist. The agent asks targeted
             follow-up questions until sufficient information is collected.
  Phase 2 — Structured Analysis: Generates the final legal analysis output
             in the prescribed format once the completeness threshold is met
             or the user explicitly requests it.

The entire conversation history is the single source of truth.
"""

from __future__ import annotations

import json
import re
import sys
import time
import logging
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean
from threading import Lock
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Ensure root app directory is importable (works locally and on Render)
# parents[3] = repo root when running from auth_app/backend/services/
# parents[2] = repo root when running from cwd=auth_app/backend
_this_file = Path(__file__).resolve()
for _depth in [3, 2, 4]:
    _candidate = str(_this_file.parents[_depth])
    if _candidate not in sys.path:
        sys.path.insert(0, _candidate)
root_dir = str(_this_file.parents[3])

try:
    from app.llm_router import generate
except ImportError:
    generate = None

DATASET_PATH = Path(__file__).resolve().parents[3] / "data" / "case_dataset_en.json"


# ═══════════════════════════════════════════════════════════════
#  COMPLETENESS CHECKLIST — attributes tracked for Phase 1
# ═══════════════════════════════════════════════════════════════

CASE_ATTRIBUTES = {
    "relationship_type": {
        "description": "Relationship between victim and respondent",
        "priority": 1,
        "indicators": [
            r"husband", r"wife", r"partner", r"boyfriend", r"ex[\s-]",
            r"colleague", r"boss", r"in[\s-]?laws?", r"family",
            r"live[\s-]?in", r"marriage", r"married", r"spouse",
            r"relative", r"neighbou?r", r"stranger", r"landlord",
        ],
    },
    "parties_involved": {
        "description": "Who is involved (names, roles, relationships)",
        "priority": 3,
        "indicators": [
            r"mother[\s-]?in[\s-]?law", r"father[\s-]?in[\s-]?law",
            r"brother[\s-]?in[\s-]?law", r"sister[\s-]?in[\s-]?law",
            r"husband", r"wife", r"children", r"parents",
        ],
    },
    "issue_types": {
        "description": "Types of issues (physical, emotional, verbal, financial, coercion, threats)",
        "priority": 1,
        "indicators": [
            r"hit", r"beat", r"slap", r"punch", r"kick", r"physical",
            r"emotional", r"mental", r"verbal", r"abuse", r"insult",
            r"financial", r"money", r"salary", r"dowry", r"demand",
            r"threat", r"coerci", r"force", r"blackmail", r"harass",
            r"sexual", r"molest", r"torture", r"cruelty",
        ],
    },
    "timeline_duration": {
        "description": "Timeline and duration of events",
        "priority": 2,
        "indicators": [
            r"\d+\s*(?:year|month|week|day)", r"since\s+\d{4}",
            r"from\s+\d{4}", r"last\s+\d+", r"ago",
            r"recently", r"for\s+(?:a\s+)?long", r"ongoing",
        ],
    },
    "living_situation": {
        "description": "Current living arrangement",
        "priority": 2,
        "indicators": [
            r"living\s+with", r"staying\s+with", r"moved\s+out",
            r"thrown\s+out", r"parents'?\s+house", r"separate",
            r"same\s+house", r"marital\s+home", r"shelter",
        ],
    },
    "financial_dependency": {
        "description": "Financial dependency or denial",
        "priority": 3,
        "indicators": [
            r"financially?\s+depend", r"no\s+income", r"housewife",
            r"not\s+working", r"earning", r"salary\s+taken",
            r"bank\s+account", r"no\s+money", r"denied\s+money",
        ],
    },
    "children_involved": {
        "description": "Whether children are involved and their situation",
        "priority": 3,
        "indicators": [
            r"child", r"children", r"son", r"daughter",
            r"custody", r"minor", r"baby", r"kid",
        ],
    },
    "prior_complaints": {
        "description": "Prior complaints or legal actions taken",
        "priority": 2,
        "indicators": [
            r"fir", r"complaint", r"police", r"report",
            r"already\s+filed", r"court", r"petition",
            r"protection\s+order", r"lawyer", r"advocate",
        ],
    },
    "evidence_available": {
        "description": "Evidence availability (messages, recordings, medical, witnesses, documents)",
        "priority": 2,
        "indicators": [
            r"message", r"whatsapp", r"screenshot", r"recording",
            r"medical\s+report", r"photo", r"video", r"cctv",
            r"witness", r"proof", r"evidence", r"document",
        ],
    },
    "relief_sought": {
        "description": "Relief sought (maintenance, protection, residence, compensation, etc.)",
        "priority": 2,
        "indicators": [
            r"maintenance", r"alimony", r"protection", r"residence",
            r"compensation", r"divorce", r"custody", r"want\s+to\s+leave",
            r"need\s+help", r"what\s+(?:can|should)\s+i\s+do",
        ],
    },
}

# Minimum % of attributes that must be at least partially resolved
COMPLETENESS_THRESHOLD = 0.55  # 55% of attributes should be present


# ═══════════════════════════════════════════════════════════════
#  SESSION STATE
# ═══════════════════════════════════════════════════════════════

@dataclass
class SessionState:
    """Full conversation state for one user session."""
    session_id: str
    story: str = ""
    summary: str = ""
    summary_fields: dict[str, Any] = field(default_factory=dict)
    correction: str | None = None
    facts: dict[str, Any] = field(default_factory=dict)
    followup_questions: list[str] = field(default_factory=list)
    answers: dict[str, str] = field(default_factory=dict)
    # Conversation memory — the single source of truth
    messages: list[dict[str, str]] = field(default_factory=list)
    # Tracked attributes — which ones are resolved
    resolved_attributes: dict[str, bool] = field(default_factory=dict)
    # Current phase: "gathering", "analysis", or "advisory"
    phase: str = "gathering"
    # How many exchanges have happened
    exchange_count: int = 0
    # Preferred language
    language: str = "en"
    # User-requested analysis
    analysis_requested: bool = False
    # The final structured analysis (cached)
    final_analysis: dict[str, str] | None = None


class ConversationStore:
    """Thread-safe in-memory session store."""

    def __init__(self) -> None:
        self._data: dict[str, SessionState] = {}
        self._lock = Lock()

    def set(self, state: SessionState) -> None:
        with self._lock:
            self._data[state.session_id] = state

    def get(self, session_id: str) -> SessionState | None:
        with self._lock:
            return self._data.get(session_id)


store = ConversationStore()


# ═══════════════════════════════════════════════════════════════
#  COMPLETENESS ANALYSIS
# ═══════════════════════════════════════════════════════════════

def analyze_completeness(full_text: str) -> tuple[dict[str, bool], float, list[str]]:
    """
    Scan the full conversation text and determine which case attributes
    are present. Returns (resolved_map, completeness_ratio, missing_attributes).
    """
    text_lower = full_text.lower()
    resolved = {}
    missing = []

    for attr_name, attr_config in CASE_ATTRIBUTES.items():
        found = any(re.search(p, text_lower) for p in attr_config["indicators"])
        resolved[attr_name] = found
        if not found:
            missing.append(attr_name)

    total = len(CASE_ATTRIBUTES)
    found_count = sum(1 for v in resolved.values() if v)
    ratio = found_count / total if total > 0 else 0.0

    # Sort missing by priority (lower number = higher priority)
    missing.sort(key=lambda k: CASE_ATTRIBUTES[k]["priority"])

    return resolved, ratio, missing


def should_transition_to_analysis(state: SessionState, user_message: str) -> bool:
    """
    Determine if we should transition from Phase 1 to Phase 2.

    Conditions:
    (a) Completeness threshold is met, OR
    (b) User explicitly requests analysis/summary
    """
    # Check explicit user request
    analysis_triggers = [
        r"generat\w*\s+(?:my\s+)?(?:summary|analysis|report|recommendation)",
        r"give\s+me\s+(?:the\s+)?(?:summary|analysis|report|prediction|recommendation)",
        r"(?:what|show)\s+(?:is|are)\s+(?:my\s+)?(?:legal\s+)?(?:options|outcomes?|prediction)",
        r"analyze\s+my\s+case",
        r"proceed\s+(?:with\s+)?(?:the\s+)?analysis",
        r"(?:i\s+(?:want|need)\s+)?(?:the\s+)?(?:final\s+)?(?:summary|analysis|output|report)",
        r"that'?s?\s+(?:all|everything|it)\b",
        r"nothing\s+(?:else|more)",
        r"no\s+(?:more\s+)?(?:details?|info|information)",
        r"i'?ve?\s+(?:shared|told|said)\s+everything",
        r"can\s+you\s+(?:now\s+)?(?:analyze|summarize|predict|recommend)",
    ]
    msg_lower = user_message.lower().strip()
    for pattern in analysis_triggers:
        if re.search(pattern, msg_lower):
            return True

    # Check completeness threshold
    full_text = _build_full_text(state)
    _, ratio, _ = analyze_completeness(full_text)
    if ratio >= COMPLETENESS_THRESHOLD and state.exchange_count >= 3:
        return True

    return False


def _build_full_text(state: SessionState) -> str:
    """Concatenate all user messages into a single text block."""
    parts = []
    for msg in state.messages:
        if msg["role"] == "user":
            parts.append(msg["content"])
    return " ".join(parts)


# ═══════════════════════════════════════════════════════════════
#  LLM PROMPTS
# ═══════════════════════════════════════════════════════════════

GATHERING_SYSTEM_PROMPT = """You are **NyayaSakhi**, an intelligent, empathetic, and adaptive AI legal assistant focused on helping users in sensitive legal situations (especially domestic issues, abuse, and personal disputes).

Your primary goals:
1. Understand the user's situation progressively (do NOT assume missing details)
2. Respond conversationally, not in rigid templates
3. Ask relevant follow-up questions when information is incomplete
4. Provide legal awareness and guidance (NOT absolute legal advice)
5. Prioritize user safety at all times

---

### CORE BEHAVIOR RULES
* NEVER generate full legal analysis if the user's input is unclear, too short, or ambiguous.
* NEVER force structured outputs like "Victim Case Summary" unless sufficient data exists.
* DO NOT hallucinate facts or assume abuse types without evidence.
* ALWAYS adapt your response based on input quality.

---

### INPUT QUALITY HANDLING
If user input is:
* Greeting ("hello", "hi") → respond warmly and invite sharing
* Nonsense ("fwa", "hh") → politely ask for clarification
* Partial info → ask targeted follow-up questions
* Detailed situation → begin structured reasoning gradually

---

### CONVERSATION FLOW LOGIC
Follow this decision pipeline:

1. **Check urgency**
   If signs of immediate danger:
   → advise contacting local authorities first

2. **Check input completeness**
   If insufficient:
   → ask 1–2 specific, simple questions (NOT a list)

3. **Build understanding step-by-step**
   Extract gradually:
   * relationship type
   * type of issue (physical, emotional, financial, etc.)
   * duration/frequency
   * evidence (if any)
   * current risk level
   * user's goal (safety, separation, financial help, etc.)

4. **Only when enough info is available**
   → provide analysis

---

### RESPONSE STYLE
* Conversational, human-like, supportive
* Avoid legal jargon unless necessary
* Break responses into small readable parts
* Do NOT dump large structured blocks

---

### RETRIEVAL-AWARE BEHAVIOR (FOR RAG)
If case knowledge is available:
* Use similar past cases to guide reasoning
* Do NOT explicitly mention "retrieved cases"
* Integrate insights naturally

---

### SAFETY LAYER
If any indication of:
* violence
* threats
* coercion
Then:
* prioritize safety guidance
* suggest reaching out to trusted person / authority

---

### OUTPUT CONSTRAINTS
* DO NOT generate long reports unless explicitly asked
* DO NOT assume missing facts
* DO NOT repeat the same structure every time
* KEEP RESPONSES ADAPTIVE

ALREADY GATHERED INFORMATION:
{gathered_info}

MISSING INFORMATION (prioritized):
{missing_info}
"""

ANALYSIS_SYSTEM_PROMPT = """You are NyayaSakhi — a senior legal case analysis AI specializing in Indian women's safety and family law.

Based on the COMPLETE conversation history provided below, generate a structured legal analysis.
The conversation history IS the single source of truth. Do not add, assume, or fabricate any facts not present in the conversation.

YOU MUST produce output in EXACTLY this format with these exact section headers. No other sections, no meta-commentary, no introduction or closing remarks outside these sections:

### Victim Case Summary
[Write a clear, coherent narrative synthesized from the entire conversation. Include: relationship type, nature of abuse/issues, timeline, living situation, financial dependency, children, evidence status, and relief sought. Present it as a factual case summary.]

### Predicted Legal Outcomes
[Provide likelihood-based assessments for each applicable legal remedy:
- Protection Order under PWDVA: [High/Moderate/Low likelihood] — [reason]
- Maintenance/Alimony: [High/Moderate/Low/Uncertain] — [reason]
- Residence Order: [if applicable]
- Custody Order: [if applicable]
- Criminal prosecution under IPC/BNS: [if applicable]
- Compensation: [if applicable]
Base these on the strength of evidence described and general legal patterns. Explicitly state where evidence is weak or missing.]

### Expected Duration of the Case
[Provide VERY SPECIFIC timelines grounded in the DURATION DATA provided below. Do NOT use vague ranges like "1-2 years". Instead:
- State the EXACT predicted range in months (e.g. "14-28 months")
- State the data source: "Based on analysis of N similar historical cases"
- If settled/mediated: give a specific month range
- If contested in court: give a specific month range
- Mention the Case Summary ID if provided
- List 2-3 specific factors that could accelerate or delay THIS particular case
USE the DURATION PREDICTION DATA provided — do NOT override it with generic estimates.]

### Decision Recommendation
[ONE clear directive. Choose from:
- "Proceed with litigation"
- "Attempt mediation/settlement first"
- "Litigate after strengthening evidence"
- "Seek urgent protection immediately"
- "Explore counseling before legal action"
Only pick one. Be decisive.]

### Reason for Recommendation
[Logically justify the recommendation using:
- Specific facts from the conversation
- Strength of available evidence
- Severity and urgency of the situation
- Likelihood of cooperation from respondent
- User's stated priorities and relief sought]

### Recommended Next Actions
[Numbered, practical, prioritized steps. Include:
1. Immediate actions (safety, evidence preservation)
2. Legal steps (filing complaints, approaching courts)
3. Documentation needed
4. Support resources (helplines, legal aid, NGOs)
Each step must be actionable and specific to THIS case.]

RULES:
- Do NOT use emojis anywhere.
- Acknowledge uncertainty where evidence is weak.
- Remain legally neutral — no guarantees.
- Base all reasoning on patterns, not assumptions.
- Tone: professional, supportive, precise.
- NO meta explanations like "Based on the information gathered..." — go straight to the content.
"""

ADVISORY_SYSTEM_PROMPT = """You are NyayaSakhi — a senior legal advisor AI specializing in Indian women's safety and family law.

You have ALREADY generated a full structured legal analysis for this user's case. The analysis is complete and cached.

NOW you are in ADVISORY MODE — the user is asking follow-up questions, seeking deeper explanations, or exploring specific topics related to their case.

CRITICAL RULES FOR ADVISORY MODE:
1. DO NOT regenerate or repeat the full structured analysis. The user already has it.
2. DO NOT use the structured format (### Victim Case Summary, ### Predicted Legal Outcomes, etc.) — that was a one-time output.
3. RESPOND DIRECTLY and CONCISELY to whatever the user asks.
4. If asked about maintenance/alimony → give specific ₹ calculations with formulas.
5. If asked about custody → explain rights, factors courts consider, and likely outcome.
6. If asked about court prediction → give honest assessment with reasoning.
7. If asked about settlement vs litigation → weigh pros and cons for THIS specific case.
8. If asked to see the full analysis again → ONLY then reproduce it.
9. Keep responses focused, practical, and conversational — no walls of text.
10. Use the CASE FACTS provided to give personalized, specific answers.

CASE FACTS FROM EARLIER CONVERSATION:
{case_facts}

PREVIOUSLY GENERATED ANALYSIS SUMMARY:
{analysis_summary}
"""

# Post-analysis advisory chip options
_POST_ANALYSIS_CHIPS = [
    {"label": "💰 Calculate Maintenance ₹", "value": "Calculate my detailed maintenance and alimony amount with exact ₹ figures"},
    {"label": "👶 Custody Rights", "value": "Explain my custody rights and what the court will consider for custody"},
    {"label": "⚖️ Predict Court Outcome", "value": "What is the most likely court outcome for my specific case?"},
    {"label": "🤝 Settle Outside Court?", "value": "Should I settle outside court or go to trial? What are the pros and cons?"},
    {"label": "🛡️ Relief Options", "value": "What specific relief options are available to me under Indian law?"},
    {"label": "🏠 Property Rights", "value": "What are my rights over property, assets, and the marital home?"},
    {"label": "📋 Evidence Strategy", "value": "How should I strengthen my evidence for a stronger case?"},
    {"label": "📅 Timeline & Process", "value": "What is the step-by-step legal process and expected timeline?"},
    {"label": "📄 Show Full Analysis", "value": "Show me the complete legal analysis again"},
]


# ═══════════════════════════════════════════════════════════════
#  KEYWORD-BASED CASE ANALYSIS (fallback + enrichment)
# ═══════════════════════════════════════════════════════════════

KEYWORDS = {
    "physical_abuse": ["hit", "beat", "injury", "slap", "physical", "violence"],
    "verbal_abuse": ["abuse", "insult", "threat", "shout", "humiliate"],
    "emotional_abuse": ["mental", "emotional", "depress", "trauma", "harass"],
    "economic_abuse": ["money", "financial", "salary", "dependent", "maintenance"],
    "sexual_abuse": ["sexual", "molest", "rape", "assault"],
    "forced_eviction": ["evict", "thrown out", "house", "home", "residence"],
    "children": ["child", "children", "custody", "son", "daughter"],
    "evidence": ["message", "whatsapp", "email", "photo", "video", "medical", "witness", "proof"],
    "safety": ["unsafe", "danger", "kill", "threaten", "risk", "fear"],
    "mediation": ["mediate", "discussion", "talk", "settle", "settlement"],
}

RELIEF_HINTS = {
    "maintenance": ["maintenance", "financial support", "money", "alimony"],
    "residence": ["residence", "house", "home", "stay in house"],
    "protection": ["protection", "safety", "restraining"],
    "compensation": ["compensation", "damages", "loss"],
    "custody": ["custody", "child"],
}

RECOMMENDATIONS = {
    "MEDIATE": "Attempt mediation/settlement first",
    "LITIGATE": "Proceed with litigation",
    "SETTLE": "Attempt settlement",
    "LITIGATE_EVIDENCE": "Litigate after strengthening evidence",
    "URGENT": "Seek urgent protection immediately",
}


def _contains_any(text: str, terms: list[str]) -> bool:
    low = text.lower()
    return any(t in low for t in terms)


def _extract_relationship(text: str) -> str | None:
    low = text.lower()
    if "husband" in low or "wife" in low or "marriage" in low:
        return "Marital relationship"
    if "live-in" in low or "partner" in low:
        return "Live-in relationship"
    if "in-law" in low or "in law" in low:
        return "Matrimonial family relationship"
    return None


def _extract_duration(text: str) -> str | None:
    m = re.search(r"(\d+\s*(?:year|years|month|months))", text.lower())
    return m.group(1) if m else None


def extract_facts(text: str) -> dict[str, Any]:
    """Extract structured facts from conversation text using keyword matching."""
    facts: dict[str, Any] = {}
    low = text.lower()

    facts["relationship_type"] = _extract_relationship(text) or "Not specified"
    facts["duration"] = _extract_duration(text) or "Not specified"

    # Abuse types
    facts["physical_abuse"] = _contains_any(low, KEYWORDS["physical_abuse"])
    facts["verbal_abuse"] = _contains_any(low, KEYWORDS["verbal_abuse"])
    facts["emotional_abuse"] = _contains_any(low, KEYWORDS["emotional_abuse"])
    facts["economic_abuse"] = _contains_any(low, KEYWORDS["economic_abuse"])
    facts["sexual_abuse"] = _contains_any(low, KEYWORDS["sexual_abuse"])
    facts["forced_eviction"] = _contains_any(low, KEYWORDS["forced_eviction"])
    facts["threat_to_safety"] = _contains_any(low, KEYWORDS["safety"])
    facts["children_involved"] = _contains_any(low, KEYWORDS["children"])
    facts["has_evidence"] = _contains_any(low, KEYWORDS["evidence"])
    facts["open_to_mediation"] = _contains_any(low, KEYWORDS["mediation"])

    # Evidence details
    evidence = []
    if _contains_any(low, ["message", "whatsapp", "email", "screenshot"]):
        evidence.append("Digital messages")
    if _contains_any(low, ["medical", "hospital", "doctor"]):
        evidence.append("Medical records")
    if _contains_any(low, ["witness"]):
        evidence.append("Witnesses")
    if _contains_any(low, ["photo", "video", "recording", "cctv"]):
        evidence.append("Photo/video evidence")
    if _contains_any(low, ["fir", "complaint", "police"]):
        evidence.append("Police complaint/FIR")
    facts["evidence_list"] = evidence

    # Relief sought
    reliefs = []
    for relief_name, terms in RELIEF_HINTS.items():
        if _contains_any(low, terms):
            reliefs.append(relief_name)
    facts["reliefs_sought"] = reliefs

    # Living situation
    if "with my parents" in low or "parents house" in low or "parents' house" in low:
        facts["living_situation"] = "With parents"
    elif "living with" in low and ("husband" in low or "respondent" in low):
        facts["living_situation"] = "With respondent"
    elif "moved out" in low or "left" in low or "staying elsewhere" in low:
        facts["living_situation"] = "Separated/moved out"
    else:
        facts["living_situation"] = "Not specified"

    # Financial dependency
    facts["financially_dependent"] = _contains_any(
        low, ["financially dependent", "no income", "housewife", "not working", "no job"]
    )

    return facts


# ═══════════════════════════════════════════════════════════════
#  DATASET-BASED CASE RETRIEVAL (for duration estimates)
# ═══════════════════════════════════════════════════════════════

from functools import lru_cache

@lru_cache(maxsize=1)
def load_dataset() -> dict[str, Any]:
    if not DATASET_PATH.exists():
        return {"records": []}
    with DATASET_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _duration_from_record(record: dict[str, Any]) -> float | None:
    duration = (((record.get("dates") or {}).get("duration")) or {})
    years = duration.get("years")
    months = duration.get("months")
    days = duration.get("days")
    if years is None and months is None and days is None:
        return None
    return float(years or 0) + (float(months or 0) / 12.0) + (float(days or 0) / 365.0)


def retrieve_similar_cases(facts: dict[str, Any], top_k: int = 5) -> list[dict[str, Any]]:
    dataset = load_dataset()
    records = dataset.get("records", [])
    if not records:
        return []

    abuse_terms = []
    for key in ["physical_abuse", "emotional_abuse", "economic_abuse", "sexual_abuse"]:
        if facts.get(key):
            abuse_terms.append(key.replace("_abuse", ""))

    relief_terms = set(facts.get("reliefs_sought") or [])

    scored: list[tuple[int, dict]] = []
    for rec in records:
        score = 0
        case_type = str(rec.get("case_type") or "").lower()
        if "domestic violence" in case_type:
            score += 2

        summary_text = str((rec.get("case_summary") or {}).get("summary_short") or "").lower()
        for term in abuse_terms:
            if term in summary_text:
                score += 2
        for term in relief_terms:
            if term in summary_text:
                score += 1

        if score > 0:
            scored.append((score, rec))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:top_k]]


# ═══════════════════════════════════════════════════════════════
#  CORE CONVERSATION ENGINE
# ═══════════════════════════════════════════════════════════════

def process_message(session_id: str, user_message: str, language: str = "en") -> dict[str, Any]:
    """
    Main entry point. Process a user message and return the agent response.

    Supports 3 phases:
      - Phase 1 (gathering): Conversational information gathering
      - Phase 2 (analysis): First-time structured legal analysis
      - Phase 3 (advisory): Free-form follow-up advice after analysis

    Returns:
        {
            "response": str,           # The assistant's reply
            "phase": str,              # "gathering", "analysis", or "advisory"
            "completeness": float,     # 0.0 to 1.0
            "resolved": dict,          # which attributes are resolved
            "missing": list[str],      # which attributes are missing
            "is_final": bool,          # whether this is the final structured output
            "final_response": dict | None,  # structured output (Phase 2)
        }
    """
    state = store.get(session_id)
    if not state:
        state = SessionState(session_id=session_id)

    # Record the user message
    state.messages.append({"role": "user", "content": user_message})
    state.exchange_count += 1
    state.language = language  # Store preferred language

    # Append to story for keyword-based fallback
    if state.story:
        state.story += " " + user_message
    else:
        state.story = user_message

    # Analyze completeness
    full_text = _build_full_text(state)
    resolved, ratio, missing = analyze_completeness(full_text)
    state.resolved_attributes = resolved

    # ── PHASE 3: Advisory (post-analysis free-form conversation) ──
    # If analysis was already generated, enter advisory mode
    if state.phase == "advisory" or (state.phase == "analysis" and state.final_analysis is not None):
        state.phase = "advisory"
        result = _generate_advisory_response(state, language=language)
        store.set(state)
        return result

    # Determine if we should transition to analysis
    transition = should_transition_to_analysis(state, user_message)

    if transition:
        # PHASE 2: Generate structured analysis (first time only)
        state.phase = "analysis"
        result = _generate_analysis(state)
        store.set(state)
        return result

    # PHASE 1: Continue gathering information
    result = _generate_gathering_response(state, resolved, ratio, missing, language=language)
    store.set(state)
    return result


def _generate_gathering_response(
    state: SessionState,
    resolved: dict[str, bool],
    ratio: float,
    missing: list[str],
    language: str = "en",
) -> dict[str, Any]:
    """Generate a conversational follow-up response during Phase 1."""

    # Build context about what we know and what we need
    gathered_lines = []
    for attr_name, is_resolved in resolved.items():
        desc = CASE_ATTRIBUTES[attr_name]["description"]
        status = "✓ Provided" if is_resolved else "✗ Not yet gathered"
        gathered_lines.append(f"- {desc}: {status}")

    missing_lines = []
    for attr_name in missing[:3]:  # Focus on top 3 missing
        desc = CASE_ATTRIBUTES[attr_name]["description"]
        missing_lines.append(f"- {desc} (priority: {CASE_ATTRIBUTES[attr_name]['priority']})")

    gathered_info = "\n".join(gathered_lines)
    missing_info = "\n".join(missing_lines) if missing_lines else "All critical attributes gathered."

    system_prompt = GATHERING_SYSTEM_PROMPT.format(
        gathered_info=gathered_info,
        missing_info=missing_info,
    )

    # Language instruction
    LANG_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi", "ta": "Tamil", "bn": "Bengali", "te": "Telugu"}
    lang_name = LANG_NAMES.get(language, "English")
    if language != "en":
        system_prompt += f"\n\nIMPORTANT: Respond in {lang_name}. The user prefers {lang_name}."

    # Build conversation history for LLM
    history_messages = []
    for msg in state.messages[-16:]:
        history_messages.append(f"{msg['role'].upper()}: {msg['content']}")
    history_text = "\n".join(history_messages)

    user_prompt = (
        f"CONVERSATION HISTORY:\n{history_text}\n\n"
        f"COMPLETENESS: {ratio*100:.0f}% ({sum(1 for v in resolved.values() if v)}/{len(resolved)} attributes)\n\n"
        f"Generate your next conversational response. Remember: acknowledge what was shared, "
        f"then ask 1-2 targeted follow-up questions about the most critical missing information."
    )

    # Try LLM generation
    response_text = None
    if generate:
        try:
            llm_result = generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.6,
                max_tokens=800,
            )
            response_text = llm_result.get("text", "").strip()
        except Exception as e:
            logger.warning(f"LLM gathering response failed: {e}")

    # Fallback if LLM fails
    if not response_text:
        response_text = _fallback_gathering_response(state, missing)

    # Record assistant response
    state.messages.append({"role": "assistant", "content": response_text})

    # Generate grouped quick-reply chips
    quick_replies = _generate_grouped_chips(resolved, missing, state)

    return {
        "response": response_text,
        "phase": "gathering",
        "completeness": round(ratio, 2),
        "resolved": resolved,
        "missing": missing,
        "is_final": False,
        "final_response": None,
        "quick_replies": quick_replies,
    }


# ── Attribute-to-chips mapping ──────────────────────────────────
_CHIP_MAP: dict[str, dict] = {
    "relationship_type": {
        "group": "Who is involved?",
        "multi": False,
        "chips": [
            {"label": "Husband", "value": "The person is my husband"},
            {"label": "Ex-husband", "value": "He is my ex-husband"},
            {"label": "Live-in partner", "value": "He is my live-in partner"},
            {"label": "In-laws", "value": "It involves my in-laws"},
            {"label": "Family member", "value": "The person is a family member"},
        ],
    },
    "parties_involved": {
        "group": "Who all are involved?",
        "multi": False,
        "chips": [
            {"label": "Just husband", "value": "Only my husband is involved"},
            {"label": "Husband + in-laws", "value": "My husband and in-laws are involved"},
            {"label": "Entire family", "value": "His entire family is involved"},
        ],
    },
    "issue_types": {
        "group": "What issues are you facing?",
        "multi": True,
        "chips": [
            {"label": "Physical violence", "value": "physical violence"},
            {"label": "Emotional abuse", "value": "emotional and mental abuse"},
            {"label": "Dowry demands", "value": "dowry harassment"},
            {"label": "Financial abuse", "value": "financial abuse"},
            {"label": "Threats", "value": "threats to safety"},
            {"label": "Sexual abuse", "value": "sexual abuse"},
        ],
    },
    "timeline_duration": {
        "group": "How long has this been going on?",
        "multi": False,
        "chips": [
            {"label": "< 6 months", "value": "Less than 6 months"},
            {"label": "6-12 months", "value": "About 6 to 12 months"},
            {"label": "1-3 years", "value": "1 to 3 years"},
            {"label": "3-5 years", "value": "3 to 5 years"},
            {"label": "5+ years", "value": "More than 5 years"},
        ],
    },
    "living_situation": {
        "group": "Where are you living now?",
        "multi": False,
        "chips": [
            {"label": "With husband", "value": "Living with husband in marital home"},
            {"label": "With parents", "value": "Living with my parents"},
            {"label": "Moved out", "value": "I have moved out and live separately"},
            {"label": "In a shelter", "value": "Staying at a shelter or safe house"},
        ],
    },
    "financial_dependency": {
        "group": "What is your financial situation?",
        "multi": False,
        "chips": [
            {"label": "Housewife / No income", "value": "I am a housewife with no income"},
            {"label": "I earn a salary", "value": "I have a job and earn a salary"},
            {"label": "Part-time / low income", "value": "I do part-time work with low income"},
            {"label": "Self-employed", "value": "I have my own small business"},
        ],
    },
    "children_involved": {
        "group": "Any children from this marriage?",
        "multi": False,
        "chips": [
            {"label": "No children", "value": "No children involved"},
            {"label": "1 child", "value": "I have 1 child"},
            {"label": "2 children", "value": "I have 2 children"},
            {"label": "3+ children", "value": "I have 3 or more children"},
        ],
    },
    "evidence_available": {
        "group": "What evidence do you have?",
        "multi": True,
        "chips": [
            {"label": "WhatsApp / Messages", "value": "WhatsApp messages and screenshots"},
            {"label": "Medical reports", "value": "medical reports from hospital"},
            {"label": "Photos / Videos", "value": "photos and video recordings"},
            {"label": "Witnesses", "value": "witnesses who saw what happened"},
            {"label": "No evidence", "value": "no physical evidence right now"},
        ],
    },
    "prior_complaints": {
        "group": "Any prior complaints filed?",
        "multi": False,
        "chips": [
            {"label": "FIR filed", "value": "I have filed an FIR"},
            {"label": "Police complaint", "value": "Complaint at police station, no FIR"},
            {"label": "Lawyer consulted", "value": "I consulted a lawyer"},
            {"label": "No action yet", "value": "No complaint or legal action taken yet"},
        ],
    },
    "relief_sought": {
        "group": "What relief do you want?",
        "multi": True,
        "chips": [
            {"label": "Protection order", "value": "protection order"},
            {"label": "Maintenance", "value": "maintenance and financial support"},
            {"label": "Divorce", "value": "divorce"},
            {"label": "Child custody", "value": "custody of children"},
            {"label": "Compensation", "value": "compensation for damages"},
        ],
    },
    "income_details": {
        "group": "Respondent's approximate income?",
        "multi": False,
        "chips": [
            {"label": "< \u20b915,000/mo", "value": "His income is less than 15000 per month"},
            {"label": "\u20b915K-30K/mo", "value": "He earns around 15000 to 30000 per month"},
            {"label": "\u20b930K-50K/mo", "value": "He earns around 30000 to 50000 per month"},
            {"label": "\u20b950K-1L/mo", "value": "He earns around 50000 to 100000 per month"},
            {"label": "\u20b91 lakh+/mo", "value": "He earns more than 1 lakh per month"},
            {"label": "I don't know", "value": "I am not sure about his exact income"},
        ],
    },
    "user_income": {
        "group": "Your monthly income (if any)?",
        "multi": False,
        "chips": [
            {"label": "No income (Housewife)", "value": "I have no income, I am a housewife"},
            {"label": "< \u20b910,000/mo", "value": "I earn less than 10000 per month"},
            {"label": "\u20b910K-25K/mo", "value": "I earn around 10000 to 25000 per month"},
            {"label": "\u20b925K-50K/mo", "value": "I earn around 25000 to 50000 per month"},
            {"label": "\u20b950K+/mo", "value": "I earn more than 50000 per month"},
        ],
    },
    "husband_property": {
        "group": "Husband's property / assets?",
        "multi": True,
        "chips": [
            {"label": "House / Flat", "value": "He owns a house or flat"},
            {"label": "Car / Vehicle", "value": "He owns a car or vehicle"},
            {"label": "Business", "value": "He owns a business"},
            {"label": "Agricultural land", "value": "He has agricultural land"},
            {"label": "Gold / Investments", "value": "He has gold and investments"},
            {"label": "Not sure", "value": "I am not sure about his property"},
        ],
    },
    "marriage_duration": {
        "group": "How long were you married?",
        "multi": False,
        "chips": [
            {"label": "< 1 year", "value": "We were married for less than 1 year"},
            {"label": "1-3 years", "value": "We were married for 1 to 3 years"},
            {"label": "3-7 years", "value": "We were married for 3 to 7 years"},
            {"label": "7-15 years", "value": "We were married for 7 to 15 years"},
            {"label": "15+ years", "value": "We were married for more than 15 years"},
        ],
    },
}


def _generate_grouped_chips(
    resolved: dict[str, bool],
    missing: list[str],
    state: SessionState,
) -> list[dict[str, Any]]:
    """
    Generate grouped quick-reply chips with deep contextual dependency logic.
    Filters both whole groups AND individual chip options based on what the
    user has already said.
    """
    groups: list[dict[str, Any]] = []
    full_text = _build_full_text(state)
    full_lower = full_text.lower()
    _, ratio, _ = analyze_completeness(full_text)

    # ═══════════════════════════════════════════════════════
    #  CONTEXT EXTRACTION — understand what user has said
    # ═══════════════════════════════════════════════════════
    ctx = {
        # Topic detection
        "seeks_divorce": any(kw in full_lower for kw in ["divorce", "want to separate", "end marriage"]),
        "seeks_custody": any(kw in full_lower for kw in ["custody", "child custody", "children custody"]),
        "seeks_maintenance": any(kw in full_lower for kw in [
            "maintenance", "alimony", "financial support",
        ]),
        "seeks_protection": any(kw in full_lower for kw in ["protection order", "protection"]),

        # Relationship already identified
        "mentioned_husband": any(kw in full_lower for kw in [
            "my husband", "husband beats", "husband hit", "married to",
            "the person is my husband",
        ]),
        "mentioned_ex_husband": any(kw in full_lower for kw in [
            "ex-husband", "former husband", "ex husband",
            "he is my ex-husband",
        ]),
        "mentioned_inlaws": any(kw in full_lower for kw in [
            "in-laws", "in laws", "mother-in-law", "father-in-law",
            "sister-in-law", "it involves my in-laws",
        ]),
        "mentioned_livein": any(kw in full_lower for kw in [
            "live-in partner", "live in partner", "boyfriend",
            "he is my live-in partner",
        ]),

        # Financial status — detect ALL chip values + natural phrases
        "is_housewife": any(kw in full_lower for kw in [
            "housewife", "no income", "no job", "i have no income",
            "i am a housewife", "i am a housewife with no income",
            "housewife / no income", "no income (housewife)",
            "i have no income, i am a housewife",
            "financially dependent", "not earning", "not employed",
            "homemaker", "unemployed", "don't work", "do not work",
            "not working", "i don't earn", "i do not earn",
        ]),
        "is_independent": any(kw in full_lower for kw in [
            "i earn", "my salary", "i have a job", "my income",
            "i have a salary", "i do part-time", "my own small business",
            "i have my own", "self-employed", "part-time work",
            "i work", "working woman", "employed",
        ]),
        "user_income_stated": any(kw in full_lower for kw in [
            "i earn less than", "i earn around", "i earn more than",
            "my income is", "i make around",
            "i earn less than 10000", "i earn around 10000 to 25000",
            "i earn around 25000 to 50000", "i earn more than 50000",
        ]),

        # Respondent income
        "husband_income_stated": any(kw in full_lower for kw in [
            "his income", "he earns", "husband earns", "less than 15000",
            "15000 to 30000", "30000 to 50000", "50000 to 100000",
            "more than 1 lakh", "not sure about his", "his exact income",
        ]),

        # Children — detect chip values too
        "mentioned_children": any(kw in full_lower for kw in [
            "children", "child", "kids", "son", "daughter",
            "i have 1 child", "i have 2 children", "i have 3",
        ]),
        "no_children": any(kw in full_lower for kw in [
            "no children", "no kids", "no child",
            "no children involved",
        ]),

        # Prior actions
        "mentioned_fir": any(kw in full_lower for kw in [
            "fir filed", "filed fir", "filed an fir", "police complaint",
            "i have filed an fir", "complaint at police",
        ]),
        "no_prior_action": any(kw in full_lower for kw in [
            "no complaint", "no legal action", "no action yet",
            "no complaint or legal action taken yet",
        ]),

        # Living
        "moved_out": any(kw in full_lower for kw in [
            "moved out", "live separately", "left his house",
            "i have moved out",
        ]),
        "with_parents": any(kw in full_lower for kw in [
            "with parents", "at my parents", "parents house",
            "living with my parents",
        ]),
        "with_husband": any(kw in full_lower for kw in [
            "living with husband", "marital home", "same house",
        ]),
        "in_shelter": any(kw in full_lower for kw in [
            "shelter", "safe house", "staying at a shelter",
        ]),

        # Evidence
        "evidence_stated": any(kw in full_lower for kw in [
            "whatsapp messages", "medical reports", "photos", "video",
            "witnesses", "no physical evidence", "no evidence",
            "screenshots", "recordings",
        ]),

        # Marriage duration
        "marriage_duration_stated": any(kw in full_lower for kw in [
            "married for less than", "married for 1 to", "married for 3 to",
            "married for 7 to", "married for more than 15",
            "we were married for",
        ]),

        # Husband property
        "husband_property_stated": any(kw in full_lower for kw in [
            "he owns a house", "he owns a car", "he owns a business",
            "agricultural land", "gold and investments",
            "not sure about his property",
        ]),
    }

    # Derived: if divorce or custody is mentioned, relationship is with spouse
    ctx["is_spousal"] = (
        ctx["seeks_divorce"] or ctx["seeks_custody"] or
        ctx["mentioned_husband"] or ctx["mentioned_ex_husband"]
    )

    # ═══════════════════════════════════════════════════════
    #  "Generate analysis" action chips
    # ═══════════════════════════════════════════════════════
    if ratio >= 0.50 and state.exchange_count >= 2:
        groups.append({
            "group": "Ready to proceed?",
            "multi": False,
            "attribute": "_action",
            "chips": [
                {"label": "\u2705 Generate my analysis", "value": "That's all I have. Please generate my complete legal analysis."},
                {"label": "I have more details", "value": "I have more details to share"},
            ],
        })

    # ═══════════════════════════════════════════════════════
    #  HELPER: Check if already answered
    # ═══════════════════════════════════════════════════════
    def _is_answered(attr: str) -> bool:
        if resolved.get(attr, False):
            return True
        if attr in _CHIP_MAP:
            return any(
                chip["value"].lower()[:20] in full_lower
                for chip in _CHIP_MAP[attr]["chips"]
            )
        return False

    # ═══════════════════════════════════════════════════════
    #  FILTER CHIPS — context-aware option filtering
    # ═══════════════════════════════════════════════════════
    def _filter_chips(attr: str, chips: list[dict]) -> list[dict]:
        """Remove irrelevant chip options based on conversation context."""

        # ── relationship_type: if divorce/custody → only spouse options ──
        if attr == "relationship_type":
            if ctx["is_spousal"]:
                return [c for c in chips if c["label"] in ("Husband", "Ex-husband")]
            # If in-laws mentioned alongside violence, keep husband + in-laws
            if ctx["mentioned_inlaws"]:
                return [c for c in chips if c["label"] in ("Husband", "In-laws")]

        # ── parties_involved: if only husband mentioned → auto-simplify ──
        if attr == "parties_involved":
            if ctx["mentioned_inlaws"]:
                return [c for c in chips if "in-laws" in c["label"].lower() or "entire" in c["label"].lower()]
            if ctx["mentioned_husband"] and not ctx["mentioned_inlaws"]:
                # Only husband, so "Just husband" is the only relevant option
                return [c for c in chips if "just" in c["label"].lower() or "husband" in c["label"].lower()]

        # ── living_situation: adapt based on relationship ──
        if attr == "living_situation":
            filtered = list(chips)
            # If ex-husband or moved out → remove "With husband"
            if ctx["mentioned_ex_husband"] or ctx["moved_out"]:
                filtered = [c for c in filtered if "with husband" not in c["label"].lower()]
            # If with parents already stated → remove that option
            if ctx["with_parents"]:
                filtered = [c for c in filtered if "with parents" not in c["label"].lower()]
            return filtered

        # ── relief_sought: remove already-mentioned reliefs + context logic ──
        if attr == "relief_sought":
            filtered = list(chips)
            if ctx["seeks_divorce"]:
                filtered = [c for c in filtered if c["label"] != "Divorce"]
            if ctx["seeks_custody"]:
                filtered = [c for c in filtered if c["label"] != "Child custody"]
            if ctx["seeks_maintenance"]:
                filtered = [c for c in filtered if c["label"] != "Maintenance"]
            if ctx["seeks_protection"]:
                filtered = [c for c in filtered if c["label"] != "Protection order"]
            # No children → remove custody option
            if ctx["no_children"]:
                filtered = [c for c in filtered if c["label"] != "Child custody"]
            return filtered

        # ── issue_types: if dowry mentioned → don't show dowry chip ──
        if attr == "issue_types":
            if "dowry" in full_lower:
                return [c for c in chips if "dowry" not in c["label"].lower()]

        # ── user_income: if housewife → don't show this group at all ──
        if attr == "user_income":
            if ctx["is_housewife"]:
                return []  # Empty = skip group — already stated no income
            if ctx["user_income_stated"]:
                return []  # Already provided income figure

        # ── financial_dependency: if already stated → skip ──
        if attr == "financial_dependency":
            if ctx["is_housewife"] or ctx["is_independent"]:
                return []  # Already known

        # ── marriage_duration: only relevant for marriage contexts ──
        if attr == "marriage_duration":
            if ctx["mentioned_livein"]:
                return []  # Not married — skip
            if ctx["marriage_duration_stated"]:
                return []  # Already stated

        # ── income_details: skip if husband income already stated ──
        if attr == "income_details":
            if ctx["husband_income_stated"]:
                return []

        # ── husband_property: skip if already stated ──
        if attr == "husband_property":
            if ctx["husband_property_stated"]:
                return []

        return chips

    # ═══════════════════════════════════════════════════════
    #  SHOULD SKIP — whole-group dependency checks
    # ═══════════════════════════════════════════════════════
    def _should_skip(attr: str) -> bool:
        """Return True if this entire group should be skipped."""
        # Already answered
        if _is_answered(attr):
            return True

        # relationship_type: skip if husband already clearly identified
        if attr == "relationship_type":
            if ctx["mentioned_husband"] or ctx["mentioned_ex_husband"] or ctx["mentioned_livein"]:
                return True

        # parties_involved: skip if only husband, no in-laws mentioned
        if attr == "parties_involved":
            if ctx["mentioned_husband"] and not ctx["mentioned_inlaws"]:
                return True

        # children_involved: skip if custody mentioned (implies children)
        # or if "no children" already stated, or if children count is given
        if attr == "children_involved":
            if ctx["no_children"]:
                return True
            if ctx["mentioned_children"]:
                return True

        # user_income: skip if housewife or income already stated
        if attr == "user_income":
            if ctx["is_housewife"] or ctx["user_income_stated"]:
                return True
            if ctx["is_independent"] and ctx["user_income_stated"]:
                return True

        # financial_dependency: skip if clearly stated
        if attr == "financial_dependency":
            if ctx["is_housewife"] or ctx["is_independent"]:
                return True

        # prior_complaints: skip if FIR or no-action already mentioned
        if attr == "prior_complaints":
            if ctx["mentioned_fir"] or ctx["no_prior_action"]:
                return True

        # marriage_duration: not applicable for live-in, or already stated
        if attr == "marriage_duration":
            if ctx["mentioned_livein"]:
                return True
            if ctx["marriage_duration_stated"]:
                return True

        # living_situation: skip if already clearly stated
        if attr == "living_situation":
            if ctx["moved_out"] or ctx["with_parents"] or ctx["with_husband"] or ctx["in_shelter"]:
                return True

        # evidence_available: skip if already stated
        if attr == "evidence_available":
            if ctx["evidence_stated"]:
                return True

        # income_details: skip if husband income already stated
        if attr == "income_details":
            if ctx["husband_income_stated"]:
                return True

        # husband_property: skip if already stated
        if attr == "husband_property":
            if ctx["husband_property_stated"]:
                return True

        return False

    # ═══════════════════════════════════════════════════════
    #  BUILD CHIP GROUPS
    # ═══════════════════════════════════════════════════════
    attrs_to_show = []
    already_shown = set()

    # Regular missing attributes (up to 4)
    for attr in missing[:4]:
        if attr in _CHIP_MAP and attr not in already_shown and not _should_skip(attr):
            attrs_to_show.append(attr)
            already_shown.add(attr)

    # Compulsory for maintenance/divorce calculation
    if ctx["seeks_maintenance"] or ctx["seeks_divorce"] or ratio >= 0.30:
        compulsory = ["income_details", "marriage_duration", "children_involved"]
        if not ctx["is_housewife"]:
            compulsory.append("user_income")
        compulsory.append("husband_property")

        for attr in compulsory:
            if attr in _CHIP_MAP and attr not in already_shown and not _should_skip(attr):
                attrs_to_show.append(attr)
                already_shown.add(attr)

    # Generate final filtered groups
    for attr in attrs_to_show:
        if attr not in _CHIP_MAP:
            continue
        entry = _CHIP_MAP[attr]
        filtered_chips = _filter_chips(attr, entry["chips"])

        # Skip if filter removed all options or only 1 obvious option
        if len(filtered_chips) == 0:
            continue

        groups.append({
            "group": entry["group"],
            "multi": entry["multi"],
            "attribute": attr,
            "chips": filtered_chips,
        })

    return groups


def _fallback_gathering_response(state: SessionState, missing: list[str]) -> str:
    """Keyword-based fallback when LLM is unavailable."""
    if state.exchange_count == 1:
        return (
            "Thank you for reaching out. I'm here to help you understand your legal options.\n\n"
            "Could you tell me a bit more about your situation? For instance:\n"
            "- What is your relationship with the person involved?\n"
            "- What kind of issues are you facing?"
        )

    question_map = {
        "relationship_type": "Could you tell me about your relationship with the person involved — are they your spouse, partner, family member, or someone else?",
        "issue_types": "What kind of issues are you experiencing — physical violence, emotional abuse, financial control, threats, or something else?",
        "timeline_duration": "How long has this been going on? When did it start?",
        "living_situation": "Are you currently living with the person, or have you separated?",
        "evidence_available": "Do you have any evidence such as messages, photos, medical reports, or witnesses?",
        "prior_complaints": "Have you filed any complaints with the police or taken any legal action so far?",
        "relief_sought": "What kind of help are you seeking — protection, financial support, divorce, custody, or something else?",
        "financial_dependency": "Are you financially dependent on the other person, or do you have your own income?",
        "children_involved": "Are there any children involved in this situation?",
        "parties_involved": "Who else is involved in this situation besides the main person?",
    }

    # Pick the top missing attribute and ask about it
    for attr in missing:
        if attr in question_map:
            return (
                "Thank you for sharing that information. I understand this is difficult.\n\n"
                + question_map[attr]
            )

    return (
        "Thank you for the details you've shared so far. "
        "Is there anything else about your situation that you'd like to tell me? "
        "When you're ready, I can generate a complete legal analysis for you."
    )


def _generate_analysis(state: SessionState) -> dict[str, Any]:
    """Generate the structured Phase 2 analysis."""

    full_text = _build_full_text(state)
    resolved, ratio, missing = analyze_completeness(full_text)

    # Build conversation transcript for the LLM
    transcript_lines = []
    for msg in state.messages:
        role_label = "User" if msg["role"] == "user" else "Legal Assistant"
        transcript_lines.append(f"{role_label}: {msg['content']}")
    transcript = "\n\n".join(transcript_lines)

    # Extract keyword-based facts for enrichment
    facts = extract_facts(full_text)
    state.facts = facts

    # Retrieve similar cases for duration estimate
    similar_cases = retrieve_similar_cases(facts, top_k=5)

    # ── Precise Duration Prediction (RAG-grounded) ──────────────
    duration_prediction = None
    duration_context = ""
    try:
        from app.duration_predictor import predict_duration

        # Map facts to prediction parameters
        case_type = "Domestic Violence"
        if facts.get("economic_abuse") or "dowry" in full_text.lower():
            case_type = "Dowry Harassment"
        elif facts.get("sexual_abuse"):
            case_type = "Sexual Assault"
        elif "maintenance" in full_text.lower() or "alimony" in full_text.lower():
            case_type = "Maintenance"
        elif "divorce" in full_text.lower():
            case_type = "Divorce"
        elif "custody" in full_text.lower():
            case_type = "Child Custody"
        elif "workplace" in full_text.lower() or "posh" in full_text.lower():
            case_type = "Workplace Harassment"

        evidence_strength = "moderate"
        if len(facts.get("evidence_list", [])) >= 3:
            evidence_strength = "strong"
        elif len(facts.get("evidence_list", [])) == 0:
            evidence_strength = "weak"

        pred_params = {
            "case_type": case_type,
            "court": "District Court",
            "jurisdiction": "India",
            "complexity": "high" if facts.get("threat_to_safety") else "medium",
            "num_parties": 3 if facts.get("children_involved") else 2,
            "evidence_strength": evidence_strength,
            "has_appeal": False,
            "description": full_text[:500],
        }
        duration_prediction = predict_duration(pred_params)

        dp = duration_prediction["predicted_duration"]
        ref_cases = duration_prediction.get("reference_cases", [])
        case_summary_id = duration_prediction["header"]["case_summary_id"]

        # Build very specific duration context for LLM
        duration_context = (
            f"DURATION PREDICTION DATA (Case Summary ID: {case_summary_id}):\n"
            f"- Predicted range: {dp['min_months']:.0f} to {dp['max_months']:.0f} months "
            f"(average: {dp['avg_months']:.1f} months)\n"
            f"- Estimated duration: {dp['estimated_duration']}\n"
            f"- Duration range: {dp['duration_range']}\n"
            f"- Confidence: {dp['confidence_level']}\n"
            f"- Based on: {dp['cases_analyzed']} similar historical Indian court cases\n"
            f"- Data source: {dp['data_source']}\n"
        )
        if ref_cases:
            duration_context += "- Reference cases:\n"
            for rc in ref_cases[:3]:
                duration_context += (
                    f"  * {rc['case_type']} — Duration: {rc['duration_text']} "
                    f"(similarity: {rc['similarity']})\n"
                )
        reasoning = duration_prediction.get("reasoning", {})
        if reasoning.get("key_factors"):
            duration_context += "- Key factors:\n"
            for kf in reasoning["key_factors"]:
                duration_context += f"  * {kf}\n"

        logger.info(
            f"[DURATION] {case_summary_id} | {case_type} | "
            f"{dp['min_months']:.0f}-{dp['max_months']:.0f} months | "
            f"conf={dp['confidence_level']}"
        )
    except Exception as e:
        logger.warning(f"Duration predictor failed, using fallback: {e}")
        duration_vals = [d for d in (_duration_from_record(c) for c in similar_cases) if d is not None]
        if duration_vals:
            avg_m = mean(duration_vals) * 12
            min_m = min(duration_vals) * 12
            max_m = max(duration_vals) * 12
            duration_context = (
                f"DURATION DATA: Based on {len(duration_vals)} similar cases, "
                f"predicted range: {min_m:.0f} to {max_m:.0f} months "
                f"(average: {avg_m:.1f} months)."
            )
        else:
            duration_context = "No similar case duration data available. Use standard estimates."

    # Generate via LLM
    response_text = None
    if generate:
        user_prompt = (
            f"COMPLETE CONVERSATION TRANSCRIPT:\n\n{transcript}\n\n"
            f"---\n\n"
            f"KEYWORD-EXTRACTED FACTS (for reference):\n"
            f"- Relationship: {facts.get('relationship_type', 'Unknown')}\n"
            f"- Duration: {facts.get('duration', 'Unknown')}\n"
            f"- Abuse types: Physical={facts.get('physical_abuse')}, "
            f"Emotional={facts.get('emotional_abuse')}, "
            f"Verbal={facts.get('verbal_abuse')}, "
            f"Financial={facts.get('economic_abuse')}, "
            f"Sexual={facts.get('sexual_abuse')}\n"
            f"- Living situation: {facts.get('living_situation', 'Unknown')}\n"
            f"- Evidence: {', '.join(facts.get('evidence_list', [])) or 'None mentioned'}\n"
            f"- Children involved: {facts.get('children_involved', False)}\n"
            f"- Relief sought: {', '.join(facts.get('reliefs_sought', [])) or 'Not specified'}\n"
            f"- Financial dependency: {facts.get('financially_dependent', False)}\n"
            f"\nDURATION REFERENCE: {duration_context}\n"
            f"\nGenerate the structured legal analysis now. Follow the format EXACTLY."
        )
        try:
            llm_result = generate(
                prompt=user_prompt,
                system_prompt=ANALYSIS_SYSTEM_PROMPT,
                temperature=0.4,
                max_tokens=3000,
            )
            response_text = llm_result.get("text", "").strip()
        except Exception as e:
            logger.warning(f"LLM analysis generation failed: {e}")

    # Build structured output
    final_response = None
    if response_text:
        # Parse the LLM response into sections
        final_response = _parse_analysis_sections(response_text)

    # Fallback to keyword-based analysis
    if not final_response:
        final_response = _fallback_analysis(facts, similar_cases)
        response_text = _format_analysis_as_text(final_response)

    # ── Inject Maintenance/Alimony ₹ Calculation ──────────────
    # This runs AFTER LLM/fallback to ensure ₹ amounts always appear
    maintenance_calc = _compute_maintenance_calculation(full_text, facts)
    if maintenance_calc and final_response:
        # Append to Predicted Legal Outcomes or create new section
        outcomes_key = None
        for key in final_response:
            if "outcome" in key.lower() or "prediction" in key.lower():
                outcomes_key = key
                break
        if outcomes_key:
            final_response[outcomes_key] += "\n\n" + maintenance_calc
        else:
            final_response["Maintenance & Alimony Calculation"] = maintenance_calc
        # Also update response_text
        response_text = _format_analysis_as_text(final_response)

    state.final_analysis = final_response

    # Record the analysis in conversation
    state.messages.append({"role": "assistant", "content": response_text or _format_analysis_as_text(final_response)})

    # Build post-analysis advisory chips
    advisory_chips = _build_post_analysis_chips(facts)

    return {
        "response": response_text or _format_analysis_as_text(final_response),
        "phase": "analysis",
        "completeness": round(ratio, 2),
        "resolved": resolved,
        "missing": missing,
        "is_final": True,
        "final_response": final_response,
        "duration_prediction": duration_prediction,
        "reference_cases": (duration_prediction or {}).get("reference_cases", []),
        "quick_replies": advisory_chips,
    }


def _build_post_analysis_chips(facts: dict[str, Any], latest_msg: str = "") -> list[dict[str, Any]]:
    """Build context-aware advisory chips shown after the analysis."""
    chips = []
    
    msg_lower = latest_msg.lower()
    
    # ── Contextual branches based on the user's last message ──
    
    if any(kw in msg_lower for kw in ["maintenance", "alimony", "₹", "calculate"]):
        chips.append({"label": "📝 How to Apply", "value": "What is the legal process to apply for interim maintenance?"})
        chips.append({"label": "📄 Required Documents", "value": "What documents do I need to prove his income and my expenses?"})
        chips.append({"label": "🚫 If He Refuses", "value": "What happens if he refuses to pay the court-ordered maintenance?"})
        chips.append({"label": "👶 Child Maintenance", "value": "How is child maintenance calculated separate from my alimony?"})
        chips.append({"label": "🔙 Back to main options", "value": "Show me other topics to explore like custody or court prediction"})
        
    elif any(kw in msg_lower for kw in ["custody", "child"]):
        chips.append({"label": "👩‍👦 Full vs Joint Custody", "value": "Can I get sole/full custody of my child? How does it differ from joint custody?"})
        chips.append({"label": "👀 Visitation Rights", "value": "What kind of visitation rights will the father likely get?"})
        chips.append({"label": "🗣️ Child's Preference", "value": "At what age does the court consider the child's own preference?"})
        chips.append({"label": "🔙 Back to main options", "value": "Show me other topics to explore like maintenance or court prediction"})
        
    elif any(kw in msg_lower for kw in ["settle", "outside court", "mediation"]):
        chips.append({"label": "🤝 How to start Mediation", "value": "How do I initiate the mediation process safely?"})
        chips.append({"label": "📜 Mutual Consent Divorce", "value": "What is a Mutual Consent Divorce and what are the steps?"})
        chips.append({"label": "⚖️ Is Settlement Binding?", "value": "If we reach an agreement outside court, is it legally binding?"})
        chips.append({"label": "🔙 Back to main options", "value": "Show me other topics to explore like maintenance or custody"})
        
    elif any(kw in msg_lower for kw in ["court outcome", "predict", "chance", "win"]):
        chips.append({"label": "⏳ Timeline", "value": "What is the realistic timeline for getting an order?"})
        chips.append({"label": "🏃‍♂️ If He Doesn't Show Up", "value": "What happens if he ignores the court summons or doesn't show up?"})
        chips.append({"label": "🛡️ Immediate Relief", "value": "What immediate relief or interim orders can I get right now?"})
        chips.append({"label": "🔙 Back to main options", "value": "Show me other topics to explore like maintenance or settlement"})
        
    else:
        # ── Default options (First summary or returning to main options) ──
        chips.append({"label": "💰 Calculate Maintenance ₹", "value": "Calculate my detailed maintenance and alimony amount with exact ₹ figures"})

        if facts.get("children_involved"):
            chips.append({"label": "👶 Custody Rights", "value": "Explain my custody rights and what the court will consider for custody"})

        chips.append({"label": "⚖️ Predict Court Outcome", "value": "What is the most likely court outcome for my specific case?"})
        chips.append({"label": "🤝 Settle Outside Court?", "value": "Should I settle outside court or go to trial? What are the pros and cons?"})
        chips.append({"label": "🛡️ Relief Options", "value": "What specific relief options are available to me under Indian law?"})
        chips.append({"label": "🏠 Property Rights", "value": "What are my rights over property, assets, and the marital home?"})

        if not facts.get("has_evidence") or len(facts.get("evidence_list", [])) < 2:
            chips.append({"label": "📋 Evidence Strategy", "value": "How should I strengthen my evidence for a stronger case?"})

        chips.append({"label": "📅 Timeline & Process", "value": "What is the step-by-step legal process and expected timeline?"})

    return [{
        "group": "Deep Dive Options" if msg_lower else "Explore further",
        "multi": False,
        "attribute": "_advisory",
        "chips": chips,
    }]


def _generate_advisory_response(state: SessionState, language: str = "en") -> dict[str, Any]:
    """Generate a free-form advisory response after the analysis is complete.

    This is Phase 3 — the user is asking follow-up questions about their case.
    Responses are conversational, focused, and don't repeat the full analysis.
    """
    full_text = _build_full_text(state)
    resolved, ratio, missing = analyze_completeness(full_text)
    facts = extract_facts(full_text)

    # Get the user's latest message
    latest_msg = ""
    for msg in reversed(state.messages):
        if msg["role"] == "user":
            latest_msg = msg["content"]
            break

    # Check if user wants to see the full analysis again
    show_full = any(kw in latest_msg.lower() for kw in [
        "show full analysis", "show me the complete", "full report",
        "entire analysis", "show everything", "repeat analysis",
        "show me the analysis again",
    ])

    if show_full and state.final_analysis:
        response_text = _format_analysis_as_text(state.final_analysis)
        state.messages.append({"role": "assistant", "content": response_text})
        return {
            "response": response_text,
            "phase": "advisory",
            "completeness": round(ratio, 2),
            "resolved": resolved,
            "missing": missing,
            "is_final": False,
            "final_response": None,
            "quick_replies": _build_post_analysis_chips(facts),
        }

    # Build case facts summary for context
    case_facts = (
        f"- Relationship: {facts.get('relationship_type', 'Unknown')}\n"
        f"- Abuse types: Physical={facts.get('physical_abuse')}, "
        f"Emotional={facts.get('emotional_abuse')}, "
        f"Financial={facts.get('economic_abuse')}\n"
        f"- Duration: {facts.get('duration', 'Unknown')}\n"
        f"- Living situation: {facts.get('living_situation', 'Unknown')}\n"
        f"- Children involved: {facts.get('children_involved', False)}\n"
        f"- Evidence: {', '.join(facts.get('evidence_list', [])) or 'None'}\n"
        f"- Relief sought: {', '.join(facts.get('reliefs_sought', [])) or 'Not specified'}\n"
        f"- Financially dependent: {facts.get('financially_dependent', False)}\n"
    )

    # Build analysis summary (short version — don't dump the whole thing)
    analysis_summary = ""
    if state.final_analysis:
        for key, val in state.final_analysis.items():
            # Only include first 200 chars of each section
            analysis_summary += f"**{key}:** {val[:200]}...\n\n"

    system_prompt = ADVISORY_SYSTEM_PROMPT.format(
        case_facts=case_facts,
        analysis_summary=analysis_summary,
    )

    # Language instruction
    LANG_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi", "ta": "Tamil", "bn": "Bengali", "te": "Telugu"}
    lang_name = LANG_NAMES.get(language, "English")
    if language != "en":
        system_prompt += f"\n\nIMPORTANT: Respond in {lang_name}. The user prefers {lang_name}."

    # Build recent conversation for context (last 10 messages)
    history_messages = []
    for msg in state.messages[-10:]:
        history_messages.append(f"{msg['role'].upper()}: {msg['content']}")
    history_text = "\n".join(history_messages)

    # Check if user asks about maintenance — inject calculation data
    maintenance_context = ""
    if any(kw in latest_msg.lower() for kw in ["maintenance", "alimony", "₹", "rupee", "calculate", "how much"]):
        maint_calc = _compute_maintenance_calculation(full_text, facts)
        if maint_calc:
            maintenance_context = f"\n\nMAINTENANCE CALCULATION DATA:\n{maint_calc}\n\nUse this data to give a detailed, specific answer with ₹ amounts."
        else:
            maintenance_context = "\n\nNote: Income data is insufficient for exact calculation. Ask the user for husband's monthly income to calculate."

    user_prompt = (
        f"RECENT CONVERSATION:\n{history_text}\n\n"
        f"USER'S LATEST QUESTION: {latest_msg}\n"
        f"{maintenance_context}\n\n"
        f"Respond directly to the user's question. Be specific, practical, and concise. "
        f"Do NOT repeat the full structured analysis. Only address what they asked."
    )

    # Try LLM generation
    response_text = None
    if generate:
        try:
            llm_result = generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.5,
                max_tokens=1200,
            )
            response_text = llm_result.get("text", "").strip()
        except Exception as e:
            logger.warning(f"LLM advisory response failed: {e}")

    # Fallback
    if not response_text:
        response_text = _fallback_advisory_response(latest_msg, facts, full_text)

    # Record response
    state.messages.append({"role": "assistant", "content": response_text})

    # Build advisory chips for next question based on the current context
    advisory_chips = _build_post_analysis_chips(facts, latest_msg)

    return {
        "response": response_text,
        "phase": "advisory",
        "completeness": round(ratio, 2),
        "resolved": resolved,
        "missing": missing,
        "is_final": False,
        "final_response": None,
        "quick_replies": advisory_chips,
    }


def _fallback_advisory_response(question: str, facts: dict[str, Any], full_text: str) -> str:
    """Keyword-based fallback for advisory responses when LLM is unavailable."""
    q = question.lower()

    if any(kw in q for kw in ["maintenance", "alimony", "₹", "calculate", "how much"]):
        calc = _compute_maintenance_calculation(full_text, facts)
        if calc:
            return f"Here is your detailed maintenance calculation:\n\n{calc}"
        return (
            "To calculate your maintenance amount, I need to know your husband's monthly income. "
            "Could you share that? The typical range is 25-33% of the husband's income if you are "
            "financially dependent (under Section 125 CrPC and Rajnesh v. Neha, 2020 SC guidelines)."
        )

    if any(kw in q for kw in ["custody", "child"]):
        return (
            "Under Indian law, the mother is the natural guardian of children below 5 years "
            "(Hindu Minority & Guardianship Act §6). For older children, courts prioritize the "
            "child's welfare above all else.\n\n"
            "Key factors courts consider:\n"
            "1. Primary caretaker during the marriage\n"
            "2. Financial stability of each parent\n"
            "3. Child's own preference (if age-appropriate)\n"
            "4. Safety and living environment\n"
            "5. Educational continuity\n\n"
            "You can apply for interim custody under PWDVA §21 immediately."
        )

    if any(kw in q for kw in ["settle", "outside court", "mediation"]):
        return (
            "Whether to settle outside court depends on several factors:\n\n"
            "**Pros of settlement:**\n"
            "- Faster resolution (weeks vs months/years)\n"
            "- Lower legal costs\n"
            "- Less emotional stress\n"
            "- Private — no public record\n\n"
            "**Pros of litigation:**\n"
            "- Court-enforced orders (stronger compliance)\n"
            "- Higher maintenance amounts possible\n"
            "- Protection orders with legal teeth\n"
            "- Criminal consequences for violations\n\n"
            "Given your situation, I'd recommend consulting a lawyer to assess "
            "which path offers the best outcome."
        )

    if any(kw in q for kw in ["court outcome", "predict", "chance", "win"]):
        return (
            "Based on the facts you've shared, here's a general assessment:\n\n"
            f"- Protection Order: {'High' if facts.get('physical_abuse') or facts.get('threat_to_safety') else 'Moderate'} likelihood\n"
            f"- Maintenance: {'High' if facts.get('financially_dependent') else 'Moderate'} likelihood\n"
            f"- Evidence strength: {'Good' if facts.get('has_evidence') else 'Needs strengthening'}\n\n"
            "Courts generally favor the petitioner in domestic violence cases when "
            "evidence is well-documented. Strengthening your evidence will significantly "
            "improve your chances."
        )

    return (
        "I'm here to help with any questions about your case. You can ask me about:\n\n"
        "- Maintenance/alimony calculations\n"
        "- Custody rights and process\n"
        "- Court outcome predictions\n"
        "- Settlement vs litigation advice\n"
        "- Relief options available to you\n"
        "- Property and asset rights\n"
        "- Evidence strengthening strategy\n\n"
        "What would you like to know more about?"
    )


def _parse_analysis_sections(text: str) -> dict[str, str] | None:
    """Parse the LLM's structured output into a dict of sections."""
    sections = {
        "Victim Case Summary": "",
        "Predicted Legal Outcomes": "",
        "Expected Duration of the Case": "",
        "Decision Recommendation": "",
        "Reason for Recommendation": "",
        "Recommended Next Actions": "",
    }

    # Try to extract each section using ### headers
    for section_name in sections:
        pattern = rf"###\s*{re.escape(section_name)}\s*\n(.*?)(?=###|\Z)"
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if match:
            sections[section_name] = match.group(1).strip()

    # Check if we got meaningful content
    filled = sum(1 for v in sections.values() if len(v) > 20)
    if filled < 3:
        return None  # Not enough sections parsed successfully

    return sections


def _compute_maintenance_calculation(full_text: str, facts: dict[str, Any]) -> str | None:
    """
    Standalone maintenance/alimony calculator.
    Returns formatted text with ₹ amounts, or None if insufficient income data.
    """
    import re
    full_lower = full_text.lower()

    def _extract_income(text: str, keywords: list[str]) -> int:
        for kw in keywords:
            idx = text.find(kw)
            if idx == -1:
                continue
            snippet = text[max(0, idx - 80):idx + 200]
            m = re.search(r'around\s+(\d[\d,]*)\s+to\s+(\d[\d,]*)\s*(?:per\s*month|monthly|/mo)', snippet)
            if m:
                return (int(m.group(1).replace(",", "")) + int(m.group(2).replace(",", ""))) // 2
            m = re.search(r'less\s+than\s+(\d[\d,]*)', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            m = re.search(r'more\s+than\s+(\d[\d,]*)', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            m = re.search(r'earns?\s+(?:around\s+)?(\d[\d,]*)\s*(?:per\s*month|monthly|/mo|pm)', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            m = re.search(r'(\d[\d,]*)\s*(?:per\s*month|monthly|/mo|pm)', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            m = re.search(r'(\d+(?:\.\d+)?)\s*lakh', snippet)
            if m:
                return int(float(m.group(1)) * 100000)
            m = re.search(r'\b(\d{4,7})\b', snippet)
            if m:
                return int(m.group(1))
        return 0

    husband_income = _extract_income(full_lower, [
        "his income", "he earns", "husband earns", "husband income",
        "respondent income", "income is less than", "income is more than",
        "earns around", "50000", "30000", "100000",
    ])
    user_income = _extract_income(full_lower, [
        "i earn", "my income", "my salary", "i make",
    ])

    if husband_income == 0:
        return None  # Can't calculate without income data

    is_dependent = (
        "housewife" in full_lower or "no income" in full_lower or
        "no job" in full_lower or "dependent" in full_lower or
        user_income == 0
    )

    # Marriage duration
    marriage_years = 5  # default
    m_dur = re.search(r'married\s+(?:for\s+)?(?:about\s+)?(\d+)\s*(?:to\s+(\d+)\s*)?year', full_lower)
    if m_dur:
        marriage_years = int(m_dur.group(2) or m_dur.group(1))
    elif "15+" in full_lower or "more than 15" in full_lower:
        marriage_years = 18
    elif "7-15" in full_lower or "7 to 15" in full_lower:
        marriage_years = 10
    elif "3-7" in full_lower or "3 to 7" in full_lower:
        marriage_years = 5
    elif "1-3" in full_lower or "1 to 3" in full_lower:
        marriage_years = 2

    has_children = facts.get("children_involved", False) or "children" in full_lower
    has_property = any(kw in full_lower for kw in ["house", "flat", "business", "land", "gold", "car"])

    child_mod = 1.15 if has_children else 1.0
    prop_mod = 1.08 if has_property else 1.0
    dur_mod = 1.15 if marriage_years >= 15 else (1.08 if marriage_years >= 7 else (1.0 if marriage_years >= 3 else 0.90))

    if is_dependent:
        law = "Section 125 CrPC / PWDVA §20 (Rajnesh v. Neha, 2020 SC)"
        low = int(husband_income * 0.25 * child_mod * prop_mod * dur_mod)
        high = int(husband_income * 0.33 * child_mod * prop_mod * dur_mod)
        return (
            f"**📊 Maintenance / Alimony Calculation (Dependent)**\n"
            f"- **Applicable Law:** {law}\n"
            f"- **Status:** Fully Dependent (Housewife / No income)\n"
            f"- **Husband's Gross Income:** ₹{husband_income:,}/month\n"
            f"- **Your Income:** Nil\n"
            f"- **Base Rate:** 25–33% of husband's gross income\n"
            f"- **Modifiers:** Marriage {marriage_years}yr ({'+' if dur_mod > 1 else ''}{(dur_mod-1)*100:.0f}%), "
            f"Children ({'Yes +15%' if has_children else 'No'}), "
            f"Property ({'Known +8%' if has_property else 'N/A'})\n"
            f"- **Estimated Monthly Maintenance:** ₹{low:,} – ₹{high:,}\n"
            f"- **Estimated Annual:** ₹{low*12:,} – ₹{high*12:,}\n"
            f"- **Interim Relief:** Courts can order interim maintenance within 60 days of filing."
        )
    else:
        law = "HMA §24/25 (Differential Income Method)"
        diff = max(0, husband_income - user_income)
        if diff > 0:
            low = int(diff * 0.20 * child_mod * prop_mod * dur_mod)
            high = int(diff * 0.28 * child_mod * prop_mod * dur_mod)
            return (
                f"**📊 Maintenance / Alimony Calculation (Independent)**\n"
                f"- **Applicable Law:** {law}\n"
                f"- **Status:** Independent (Earning)\n"
                f"- **Husband's Income:** ₹{husband_income:,}/month\n"
                f"- **Your Income:** ₹{user_income:,}/month\n"
                f"- **Income Differential:** ₹{diff:,}/month\n"
                f"- **Base Rate:** 20–28% of income differential\n"
                f"- **Estimated Monthly Maintenance:** ₹{low:,} – ₹{high:,}\n"
                f"- **Estimated Annual:** ₹{low*12:,} – ₹{high*12:,}"
            )
        return None


def _fallback_analysis(facts: dict[str, Any], similar_cases: list[dict]) -> dict[str, str]:
    """Generate analysis using keyword extraction when LLM is unavailable."""

    abuse_types = []
    if facts.get("physical_abuse"):
        abuse_types.append("physical abuse")
    if facts.get("emotional_abuse"):
        abuse_types.append("emotional abuse")
    if facts.get("verbal_abuse"):
        abuse_types.append("verbal abuse")
    if facts.get("economic_abuse"):
        abuse_types.append("economic/financial abuse")
    if facts.get("sexual_abuse"):
        abuse_types.append("sexual abuse")

    summary = (
        f"Relationship type: {facts.get('relationship_type', 'Not specified')}. "
        f"Duration: {facts.get('duration', 'Not specified')}. "
        f"Abuse types reported: {', '.join(abuse_types) if abuse_types else 'Issues reported, type needs clarification'}. "
        f"Living situation: {facts.get('living_situation', 'Not specified')}. "
        f"Evidence available: {', '.join(facts.get('evidence_list', [])) or 'Not specified'}. "
        f"Children involved: {'Yes' if facts.get('children_involved') else 'No/Not mentioned'}. "
        f"Relief sought: {', '.join(facts.get('reliefs_sought', [])) or 'Not specified'}."
    )

    outcomes = []
    outcomes.append("Protection Order: Moderate likelihood if threats or violence are documented.")

    # ── Maintenance / Alimony Calculation ────────────────────────
    # Extract income figures from full text
    import re
    full_lower = full_text.lower()

    def _extract_income(text: str, keywords: list[str]) -> int:
        """Extract monthly income from text near given keywords."""
        for kw in keywords:
            idx = text.find(kw)
            if idx == -1:
                continue
            snippet = text[max(0, idx - 80):idx + 200]
            # Pattern 1: "around X to Y per month" → take midpoint
            m = re.search(r'around\s+(\d[\d,]*)\s+to\s+(\d[\d,]*)\s*(?:per\s*month|monthly|/mo)', snippet)
            if m:
                lo = int(m.group(1).replace(",", ""))
                hi = int(m.group(2).replace(",", ""))
                return (lo + hi) // 2
            # Pattern 2: "less than X per month"
            m = re.search(r'less\s+than\s+(\d[\d,]*)\s*(?:per\s*month|monthly|/mo)?', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            # Pattern 3: "more than X per month" or "more than X lakh"
            m = re.search(r'more\s+than\s+(\d[\d,]*)\s*(?:per\s*month|monthly|/mo|lakh)?', snippet)
            if m:
                val = int(m.group(1).replace(",", ""))
                if "lakh" in snippet[m.start():m.end() + 10]:
                    val = val * 100000
                return val
            # Pattern 4: "earns X per month"
            m = re.search(r'earns?\s+(?:around\s+)?(\d[\d,]*)\s*(?:per\s*month|monthly|/mo|pm)', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            # Pattern 5: numbers with per month
            m = re.search(r'(\d[\d,]*)\s*(?:per\s*month|monthly|/mo|pm)', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            # Pattern 6: X lakh
            m = re.search(r'(\d+(?:\.\d+)?)\s*lakh', snippet)
            if m:
                return int(float(m.group(1)) * 100000)
            # Pattern 7: ₹X or Rs.X
            m = re.search(r'(?:rs\.?|₹)\s*(\d[\d,]*)', snippet)
            if m:
                return int(m.group(1).replace(",", ""))
            # Pattern 8: plain large numbers
            m = re.search(r'\b(\d{4,7})\b', snippet)
            if m:
                return int(m.group(1))
        return 0

    husband_income = _extract_income(full_lower, [
        "his income", "he earns", "husband earns", "husband income",
        "respondent income", "respondent earns", "husband's income",
        "income is less than", "income is more than",
    ])
    user_income = _extract_income(full_lower, [
        "i earn", "my income", "my salary", "i make", "i get paid",
    ])

    is_dependent = (
        "housewife" in full_lower or
        "no income" in full_lower or
        "no job" in full_lower or
        "dependent" in full_lower or
        user_income == 0
    )
    is_independent = user_income > 0 and not is_dependent

    # Marriage duration extraction
    marriage_years = 0
    m_dur = re.search(r'married\s+(?:for\s+)?(?:about\s+)?(\d+)\s*(?:to\s+(\d+)\s*)?year', full_lower)
    if m_dur:
        marriage_years = int(m_dur.group(2) or m_dur.group(1))
    elif "15+ year" in full_lower or "more than 15" in full_lower:
        marriage_years = 18
    elif "7-15 year" in full_lower or "7 to 15" in full_lower:
        marriage_years = 10
    elif "3-7 year" in full_lower or "3 to 7" in full_lower:
        marriage_years = 5
    elif "1-3 year" in full_lower or "1 to 3" in full_lower:
        marriage_years = 2
    elif "less than 1" in full_lower:
        marriage_years = 1

    # Children modifier
    has_children = facts.get("children_involved", False)
    child_modifier = 1.15 if has_children else 1.0

    # Property modifier (adds 5-10% if assets are known)
    has_property = any(kw in full_lower for kw in ["house", "flat", "business", "land", "gold", "investment", "car"])
    property_modifier = 1.08 if has_property else 1.0

    # Marriage duration modifier (longer = higher %)
    if marriage_years >= 15:
        duration_modifier = 1.15
    elif marriage_years >= 7:
        duration_modifier = 1.08
    elif marriage_years >= 3:
        duration_modifier = 1.0
    else:
        duration_modifier = 0.90

    maintenance_text = ""
    if husband_income > 0:
        if is_dependent:
            # DEPENDENT: Section 125 CrPC / PWDVA §20 — 25-33% of husband's gross
            applicable_law = "Section 125 CrPC / PWDVA §20 (Rajnesh v. Neha, 2020)"
            base_pct_low = 0.25
            base_pct_high = 0.33
            adjusted_low = int(husband_income * base_pct_low * child_modifier * property_modifier * duration_modifier)
            adjusted_high = int(husband_income * base_pct_high * child_modifier * property_modifier * duration_modifier)
            maintenance_text = (
                f"\n\n**Predicted Maintenance / Alimony:**\n"
                f"- **Status:** Fully Dependent (Housewife/No income)\n"
                f"- **Applicable Law:** {applicable_law}\n"
                f"- **Husband's Income:** ₹{husband_income:,}/month\n"
                f"- **Your Income:** Nil (Dependent)\n"
                f"- **Base Rate:** 25-33% of husband's gross income\n"
                f"- **Adjustments:** Marriage duration ({marriage_years}yr), "
                f"Children ({'Yes' if has_children else 'No'}), "
                f"Property ({'Known assets' if has_property else 'Not specified'})\n"
                f"- **Estimated Monthly Maintenance:** ₹{adjusted_low:,} – ₹{adjusted_high:,}/month\n"
                f"- **Estimated Annual:** ₹{adjusted_low * 12:,} – ₹{adjusted_high * 12:,}/year"
            )
        else:
            # INDEPENDENT: HMA §24/25 — Differential income basis
            applicable_law = "HMA §24/25 (Differential Income Method)"
            income_diff = max(0, husband_income - user_income)
            if income_diff > 0:
                base_pct_low = 0.20
                base_pct_high = 0.28
                adjusted_low = int(income_diff * base_pct_low * child_modifier * property_modifier * duration_modifier)
                adjusted_high = int(income_diff * base_pct_high * child_modifier * property_modifier * duration_modifier)
                maintenance_text = (
                    f"\n\n**Predicted Maintenance / Alimony:**\n"
                    f"- **Status:** Independent (Earning)\n"
                    f"- **Applicable Law:** {applicable_law}\n"
                    f"- **Husband's Income:** ₹{husband_income:,}/month\n"
                    f"- **Your Income:** ₹{user_income:,}/month\n"
                    f"- **Income Differential:** ₹{income_diff:,}/month\n"
                    f"- **Base Rate:** 20-28% of income differential\n"
                    f"- **Adjustments:** Marriage duration ({marriage_years}yr), "
                    f"Children ({'Yes' if has_children else 'No'}), "
                    f"Property ({'Known assets' if has_property else 'Not specified'})\n"
                    f"- **Estimated Monthly Maintenance:** ₹{adjusted_low:,} – ₹{adjusted_high:,}/month\n"
                    f"- **Estimated Annual:** ₹{adjusted_low * 12:,} – ₹{adjusted_high * 12:,}/year"
                )
            else:
                maintenance_text = (
                    f"\n\n**Predicted Maintenance / Alimony:**\n"
                    f"- **Status:** Independent (Higher earner)\n"
                    f"- **Applicable Law:** {applicable_law}\n"
                    f"- **Note:** Your income (₹{user_income:,}) exceeds husband's declared income (₹{husband_income:,}). "
                    f"Maintenance claim may be limited. Court considers total assets and standard of living."
                )
    elif facts.get("economic_abuse") or facts.get("financially_dependent"):
        maintenance_text = (
            "\n\n**Maintenance / Alimony:** High likelihood where financial dependency is established. "
            "Provide husband's income details for a precise calculation."
        )

    if maintenance_text:
        outcomes.append(f"Maintenance:{maintenance_text}")
    elif facts.get("economic_abuse") or facts.get("financially_dependent"):
        outcomes.append("Maintenance: High likelihood where financial dependency is established.")

    # Other legal outcomes
    if facts.get("forced_eviction"):
        outcomes.append("Residence Order: High likelihood where displacement from shared household is shown.")
    if facts.get("children_involved"):
        outcomes.append("Custody: Interim custody may be considered based on child welfare assessment.")
    if facts.get("physical_abuse") or facts.get("sexual_abuse"):
        outcomes.append("Criminal Prosecution: Possible under IPC/BNS sections if FIR is filed with supporting evidence.")
    if not facts.get("has_evidence"):
        outcomes.append("Note: Evidence appears limited which may reduce outcome certainty.")

    # Duration — use predictor for specific data
    duration = ""
    try:
        from app.duration_predictor import predict_duration
        pred = predict_duration({
            "case_type": "Domestic Violence",
            "court": "District Court",
            "jurisdiction": "India",
            "complexity": "high" if facts.get("threat_to_safety") else "medium",
            "num_parties": 3 if facts.get("children_involved") else 2,
            "evidence_strength": "moderate" if facts.get("has_evidence") else "weak",
        })
        dp = pred["predicted_duration"]
        case_id = pred["header"]["case_summary_id"]
        refs = pred.get("reference_cases", [])
        ref_text = ""
        if refs:
            ref_text = " Reference cases: " + "; ".join(
                f"{r['case_type']} ({r['duration_text']})" for r in refs[:2]
            ) + "."
        duration = (
            f"Prediction ID: {case_id}. "
            f"If settled/mediated: {max(1, dp['min_months'] * 0.5):.0f}-{dp['min_months']:.0f} months. "
            f"If contested in court: {dp['min_months']:.0f}-{dp['max_months']:.0f} months "
            f"(predicted average: {dp['avg_months']:.1f} months). "
            f"Confidence: {dp['confidence_level']}. "
            f"Based on {dp['cases_analyzed']} similar Indian court cases."
            f"{ref_text} "
            f"Factors: Court backlog, evidence strength, and respondent cooperation can shift this by +/-30%."
        )
    except Exception:
        duration_vals = [d for d in (_duration_from_record(c) for c in similar_cases) if d is not None]
        if duration_vals:
            avg_m = mean(duration_vals) * 12
            min_m = min(duration_vals) * 12
            max_m = max(duration_vals) * 12
            duration = (
                f"If settled: {min_m * 0.5:.0f}-{min_m:.0f} months. "
                f"If contested: {min_m:.0f}-{max_m:.0f} months "
                f"(avg: {avg_m:.1f} months from {len(duration_vals)} cases). "
                f"Interim relief possible within weeks."
            )
        else:
            duration = "If settled/mediated: 3-6 months. If contested in court: 12-24 months. Interim relief possible within weeks of filing."

    # Strategy
    severity = sum(1 for f in ["physical_abuse", "sexual_abuse", "threat_to_safety", "forced_eviction"] if facts.get(f))
    evidence_count = len(facts.get("evidence_list", []))
    cooperative = facts.get("open_to_mediation", False)

    if facts.get("threat_to_safety"):
        recommendation = RECOMMENDATIONS["URGENT"]
        reason = "Immediate safety risk is indicated. Urgent protective action must precede all other steps."
    elif severity >= 2 and not cooperative:
        recommendation = RECOMMENDATIONS["LITIGATE"]
        reason = "Abuse severity is high and cooperation likelihood appears low, warranting formal legal proceedings."
    elif severity >= 1 and evidence_count == 0:
        recommendation = RECOMMENDATIONS["LITIGATE_EVIDENCE"]
        reason = "The situation is legally actionable but evidence needs strengthening for a stronger case."
    elif cooperative:
        recommendation = RECOMMENDATIONS["MEDIATE"]
        reason = "There appears to be scope for negotiation. Mediation can provide faster resolution if both parties cooperate."
    else:
        recommendation = RECOMMENDATIONS["LITIGATE"]
        reason = "Based on the facts described, formal legal proceedings are recommended for effective resolution."

    actions = [
        "1. Preserve all evidence immediately — screenshot messages, keep medical reports, note witness contacts.",
        "2. Prepare a chronological timeline of all incidents with dates, descriptions, and any witnesses.",
        "3. Consult a qualified family law advocate in your area for personalized legal counsel.",
        "4. If safety is at risk, call 112 (Emergency) or 181 (Women Helpline) immediately.",
        "5. Consider approaching the local Protection Officer or Magistrate for interim protection orders.",
        "6. Keep certified copies of all important documents (marriage certificate, property papers, FIRs) in a safe place.",
    ]

    return {
        "Victim Case Summary": summary,
        "Predicted Legal Outcomes": "\n".join(outcomes),
        "Expected Duration of the Case": duration,
        "Decision Recommendation": recommendation,
        "Reason for Recommendation": reason,
        "Recommended Next Actions": "\n".join(actions),
    }


def _format_analysis_as_text(final_response: dict[str, str]) -> str:
    """Convert the structured dict into a readable markdown text."""
    parts = []
    for title, content in final_response.items():
        parts.append(f"### {title}\n{content}")
    return "\n\n".join(parts)


# ═══════════════════════════════════════════════════════════════
#  LEGACY COMPATIBILITY — keep old function signatures working
# ═══════════════════════════════════════════════════════════════

def summarize_story(story: str) -> tuple[str, dict[str, Any], bool]:
    """Legacy compatibility wrapper."""
    result = process_message(f"legacy-{hash(story)}", story)
    fields = result.get("resolved", {})
    return result["response"], fields, not result["is_final"]


def build_followup(state: SessionState) -> list[str]:
    """Legacy: build follow-up questions from state."""
    full_text = _build_full_text(state)
    _, _, missing = analyze_completeness(full_text)

    question_map = {
        "relationship_type": "What is your relationship with the person involved?",
        "issue_types": "What kind of issues are you experiencing?",
        "timeline_duration": "How long has this been going on?",
        "living_situation": "Are you currently living with the person?",
        "evidence_available": "Do you have any evidence or proof?",
        "prior_complaints": "Have you filed any complaints or taken legal action?",
        "relief_sought": "What kind of help or relief are you seeking?",
        "financial_dependency": "Are you financially dependent on the other person?",
        "children_involved": "Are children involved in this situation?",
        "parties_involved": "Who else is involved besides the main person?",
    }

    questions = [question_map[attr] for attr in missing if attr in question_map]
    return questions[:5]


def finalize_analysis(state: SessionState) -> dict[str, str]:
    """Legacy: generate final analysis from state."""
    full_text = _build_full_text(state)
    if state.correction:
        full_text += f" {state.correction}"
    for v in state.answers.values():
        full_text += f" {v}"

    facts = extract_facts(full_text)
    similar_cases = retrieve_similar_cases(facts, top_k=5)
    return _fallback_analysis(facts, similar_cases)
