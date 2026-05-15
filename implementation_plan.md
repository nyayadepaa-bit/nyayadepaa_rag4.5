# NyayaSakhi RAG Workflow — Smart Chip Dependencies & Post-Analysis Follow-Up

## Problems Identified

### 1. Illogical Chip Dependencies
- User selects "Housewife / No income" → system still shows "YOUR MONTHLY INCOME?" chips
- The `_should_skip` and `_filter_chips` functions have the right logic, but they only check `user_income` — the `financial_dependency` attribute is resolved by regex match, not by actual chip selection
- The `is_housewife` context check doesn't catch all chip value strings

### 2. No Post-Analysis Follow-Up Chips
- After the analysis is generated (`phase == "analysis"`), no follow-up chips are offered
- User has no way to ask for deeper advice on specific topics

### 3. Post-Analysis Forced Structure
- Every follow-up after analysis regenerates the entire structured analysis
- Should give concise, targeted answers to specific follow-up questions
- Should NOT repeat the full output unless explicitly asked

### 4. Maintenance Calculation Not Always Triggered
- Calculation exists but may not fire reliably

---

## Implementation Plan

### Phase A: Fix Chip Dependency Logic (rag_workflow.py)

1. **Strengthen `is_housewife` detection** — add all chip values to context detection
2. **Add cross-attribute value propagation** — when "Housewife / No income" chip is selected, mark `user_income` as auto-resolved
3. **Add `_auto_resolve_dependencies`** — function that automatically resolves dependent attributes based on already-provided answers

### Phase B: Post-Analysis Follow-Up System

1. **Add `POST_ANALYSIS_CHIPS`** — new chip set shown after analysis:
   - "Calculate maintenance/alimony"
   - "Predict court outcome in detail"
   - "Should I settle or go to court?"
   - "Child custody advice"
   - "What documents do I need?"
   - "How to file FIR/complaint?"
   - "Property rights"
   - "Protection order process"

2. **Add `_handle_post_analysis_followup`** — new function for Phase 2+ messages
   - Routes to specific topic handlers
   - Uses flexible LLM prompt (NOT the full analysis format)
   - Maintenance calculation is always available

3. **Modify `process_message`** — after first analysis, route new messages to follow-up handler

### Phase C: Flexible Post-Analysis Response Format

1. **New `FOLLOWUP_SYSTEM_PROMPT`** — concise, targeted, conversational
2. **Don't repeat past output** — only answer the specific question
3. **Re-generate full analysis ONLY if user explicitly asks**

---

## Files to Modify
- `auth_app/backend/services/rag_workflow.py` — all changes in this file
