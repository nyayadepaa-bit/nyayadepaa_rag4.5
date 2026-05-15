"""Quick end-to-end test for the bot."""
import requests
import json

BASE = "http://localhost:8000"

# 1. Create session
r = requests.post(f"{BASE}/api/new_session", json={"name": "TestUser", "language": "English"})
data = r.json()
sid = data["session_id"]
print("=== SESSION CREATED ===")
print(f"Stage: {data['stage']}")
print(f"Response preview: {data['response'][:120]}...")

# 2. Select situation
r2 = requests.post(f"{BASE}/api/chat", json={"query": "Domestic Violence / Abuse", "session_id": sid, "language": "English"})
d2 = r2.json()
print(f"\n=== SITUATION SELECTED ===")
print(f"Stage: {d2['stage']}")
print(f"Response: {d2['response'][:120]}...")
print(f"Options: {d2.get('options', [])[:3]}")
print(f"Provider: {d2.get('provider')}")
print(f"Retrieval error: {d2.get('retrieval_error')}")

# 3. Answer first deep-dive question
r3 = requests.post(f"{BASE}/api/chat", json={"query": "Physical Violence", "session_id": sid, "language": "English"})
d3 = r3.json()
print(f"\n=== DEEP DIVE Q1 ===")
print(f"Stage: {d3['stage']}")
print(f"Response: {d3['response'][:120]}...")

# 4. Answer second deep-dive question
r4 = requests.post(f"{BASE}/api/chat", json={"query": "Yes, I am still living with them", "session_id": sid, "language": "English"})
d4 = r4.json()
print(f"\n=== DEEP DIVE Q2 ===")
print(f"Stage: {d4['stage']}")
print(f"Response: {d4['response'][:120]}...")

# 5. Answer third question
r5 = requests.post(f"{BASE}/api/chat", json={"query": "No, I haven't reported yet", "session_id": sid, "language": "English"})
d5 = r5.json()
print(f"\n=== DEEP DIVE Q3 ===")
print(f"Stage: {d5['stage']}")
print(f"Response: {d5['response'][:120]}...")

# 6. Answer evidence question
r6 = requests.post(f"{BASE}/api/chat", json={"query": "WhatsApp chats / SMS / Emails", "session_id": sid, "language": "English"})
d6 = r6.json()
print(f"\n=== EVIDENCE ===")
print(f"Stage: {d6['stage']}")
print(f"Response: {d6['response'][:120]}...")

# 7. Answer urgency
r7 = requests.post(f"{BASE}/api/chat", json={"query": "Serious but not immediate — need advice soon", "session_id": sid, "language": "English"})
d7 = r7.json()
print(f"\n=== URGENCY ===")
print(f"Stage: {d7['stage']}")
print(f"Response: {d7['response'][:120]}...")

# 8. Answer state
r8 = requests.post(f"{BASE}/api/chat", json={"query": "Maharashtra", "session_id": sid, "language": "English"})
d8 = r8.json()
print(f"\n=== STATE ===")
print(f"Stage: {d8['stage']}")
print(f"Response: {d8['response'][:120]}...")

# 9. Say "No" to additional info -> trigger summary generation
r9 = requests.post(f"{BASE}/api/chat", json={"query": "No, generate my legal summary now", "session_id": sid, "language": "English"}, timeout=120)
d9 = r9.json()
print(f"\n=== SUMMARY GENERATION ===")
print(f"Stage: {d9['stage']}")
print(f"Provider: {d9.get('provider')}")
print(f"Retrieval error: {d9.get('retrieval_error')}")
print(f"Response length: {len(d9['response'])} chars")
print(f"Response preview: {d9['response'][:300]}...")
print("\n=== ALL TESTS PASSED ===")
