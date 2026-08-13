# API Costs & Spending Limits

## Current Architecture

**Phase 3 (Voice I/O)** + **Phase 3.5 (Gestures)**:
- Vision calls via Claude Haiku (cheapest model)
- Only on-demand (you trigger via voice/gesture)
- Typical call: ~0.15¢ (100 tokens max)

**Free tier capacity**: ~$5/month budget = 3,333+ API calls before hitting limit.

## Setting API Spending Limit to $0 (Stop All Charges)

### In Anthropic Console:

1. Go to https://console.anthropic.com
2. **Billing** → **Plans & Billing**
3. **Set monthly limit** → Set to **$0.00**
4. Or **disable billing** entirely (free tier only)

### What happens at $0 limit:
- All API calls fail with `error: budget exceeded`
- Server returns `{ error: "describe failed" }` (HTTP 502)
- UI shows toast: `[error] request failed`
- Voice/gesture detection still works (local), but Claude responses fail
- **You know when you hit the limit instantly** (not surprised by a bill)

## Cost Breakdown (if you do enable billing)

| Model | Use Case | Cost/Call | Typical Input | Typical Output |
|-------|----------|-----------|---------------|----------------|
| **Haiku vision** | Scene description | $0.0015 | 256 tokens | ~50 tokens |
| **Haiku vision** | Voice question | $0.0015 | 300 tokens | ~80 tokens |
| **Haiku vision** | Face detection | $0.0015 | 256 tokens | ~100 tokens |

**Real examples:**
- 1 ambient scene description: ~$0.0015 (0.15¢)
- 1 voice question answered: ~$0.0020 (0.2¢)
- 1 face detection (read mode): ~$0.0020 (0.2¢)
- 100 interactions per day: ~$6/month

## Recommended Settings

### Development (while testing)
```
Spending limit: $1.00/month
Allows ~600 test calls, clear when hitting limit
```

### Production (when deployed)
```
Spending limit: $10.00/month (or your budget)
Monitor usage weekly
```

### Zero-Cost Testing (NOW)
```
Spending limit: $0.00
All API calls blocked
Gesture + voice framework still works locally
```

## Monitoring Actual Usage

**Check usage in Anthropic Console:**
1. **Billing** → **Usage**
2. See daily breakdown by model
3. Set alerts for overage (if enabled)

**Check usage programmatically:**
```bash
# Would need Anthropic API key to fetch usage stats
# (not implemented yet — future phase)
```

## Future: Reduce API Costs Further

### Caching (Phase 4)
- Cache repeated questions
- Save ~30% on identical requests

### Local Models (Phase 5)
- Run small LLM locally (Ollama, Llamafile)
- Vision stays with Claude (cheaper than local)
- ~50% cost reduction

### Budget per Gesture
Example: Cap each gesture trigger to 100 tokens max
- Today: auto-set by `max_tokens: 128`
- Current: Haiku 128 tokens = ~$0.002 per call
- Already optimized for cost

---

## Action: Set Limit to $0 Now

1. Open https://console.anthropic.com/account/billing/overview
2. Find **"Soft Limit"** or **"Monthly Limit"**
3. Set to **$0**
4. Confirm and save

**Result**: All API calls will fail until you raise the limit. Voice/gesture detection still works locally (cost: $0).

---

**Verify it worked**: Try asking a voice question. You should see `[error] request failed` toast instead of an answer.
