# Shadow Mode Strategy

Shadow Mode is the **risk-elimination protocol** that lets us test the platform against real production data without ever interfering with current operations.

---

## What Shadow Mode Does

When `shadow_mode = TRUE` in `feature_flags`:

| System behavior | Shadow Mode ON | Shadow Mode OFF |
|----------------|---------------|----------------|
| Ingest TikTok orders | ✅ Yes — stored to DB | ✅ Yes |
| Mark orders `shadow_mode=true` | ✅ Yes | ❌ No |
| Send messages to TikTok CS | ❌ Blocked | ✅ Yes |
| Update TikTok order status | ❌ Blocked | ✅ Yes |
| Designer KDS shows jobs | ✅ Yes | ✅ Yes |
| Auto-send QC proof photo | ❌ Blocked | ✅ Yes |
| SMS via Semaphore | ❌ Blocked | ✅ Yes |

**In short: shadow mode = read and store everything, write nothing back.**

---

## Why 7 Days?

The business processes 100–200 orders per day. Seven days = 700–1,400 orders. That's enough volume to:
- Catch any deduplication edge cases  
- Verify that all order types (single items, multi-items, cancelled, re-orders) are handled correctly  
- Give the design team time to use the KDS in parallel with Excel and verify they match  
- Build confidence before the go-live toggle

---

## Gate System

Shadow Mode ends only when all Gate 1 criteria are met. Gates are manually verified by the admin.

### Gate 1: OMS + KDS Go-Live
Toggle: `shadow_mode = false`

- [ ] 7 consecutive days with **0 duplicate orders** in the `orders` table  
- [ ] 100% of TikTok orders appear within **30 seconds** of placement  
- [ ] KDS real-time updates confirmed at **< 5 second** latency  
- [ ] Design team used KDS **in parallel with Excel** for 3+ days and confirmed it matches  
- [ ] At least one **manual test order** placed and confirmed end-to-end  

**How to flip Gate 1:**
```sql
UPDATE feature_flags SET enabled = true WHERE name = 'shadow_mode';
-- Wait, shadow_mode = true MEANS we're in shadow mode.
-- To go live, set it to FALSE:
UPDATE feature_flags SET enabled = false WHERE name = 'shadow_mode';
```

> ⚠️ **This is irreversible from a trust perspective.** Once you go live, TikTok customers are affected. Get stakeholder sign-off before flipping.

---

### Gate 2: Chatbot Suggest Mode
Toggle: `chatbot_suggest_mode = true`

Prerequisites: Gate 1 must be complete first.

- [ ] Bot Playground: complete 6-step spec collection correctly for **20+ test scenarios**  
- [ ] Intent accuracy: manually rate **50 real conversations** → ≥90% correctly classified  
- [ ] Handoff triggers correctly on complaint/damage/refund messages  
- [ ] "Take Over" button tested and confirmed working  

**How to flip Gate 2:**
```sql
UPDATE feature_flags SET enabled = true WHERE name = 'chatbot_suggest_mode';
```

---

### Gate 3: Chatbot Full Auto
Toggle: `chatbot_auto_mode = true`

Prerequisites: Gate 2 must be running for at least 1 week.

- [ ] Suggest mode send-as-is rate: **≥85% over 100 conversations**  
- [ ] No critical misclassifications in the last **50 conversations** (reviewed in QA tab)  
- [ ] Human handoff tested and confirmed working  
- [ ] Admin team comfortable with fully autonomous responses  

**How to flip Gate 3:**
```sql
UPDATE feature_flags SET enabled = true  WHERE name = 'chatbot_auto_mode';
UPDATE feature_flags SET enabled = false WHERE name = 'chatbot_suggest_mode';
```

---

## Monitoring Shadow Mode

The `/admin/stats` page shows real-time shadow statistics:

| Metric | Where |
|--------|-------|
| Total orders ingested | `COUNT(*) FROM orders` |
| Shadow mode status | `SELECT enabled FROM feature_flags WHERE name='shadow_mode'` |
| Pending spec orders | `COUNT(*) WHERE status='pending_spec'` |
| Duplicates blocked | Tracked via upsert conflict logging (Phase 1 polish) |

---

## Rollback Plan

If something goes wrong after going live:

1. **Immediate:** Set `shadow_mode = true` in Supabase Dashboard → SQL Editor  
2. Continue processing orders manually in TikTok Seller Center (existing workflow)  
3. Investigate issue with logs → fix → re-run Gate 1 checklist  

The system is designed so that **reverting to shadow mode is always safe** — it just stops writing back to TikTok. Existing order data in the DB is untouched.
