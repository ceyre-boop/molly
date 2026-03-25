---
domain: agency
type: persistent-context
---

# 🏢 TABOOST Context (Always Loaded)

## Platform Architecture
```
Google Sheets (Source of Truth)
    ↓ (Apps Script, daily 10 AM PT)
CSV files in /data/
    ↓ (GitHub Pages hosts)
Live static sites
    ↓ (JavaScript reads CSV)
User dashboards
```

## Key URLs
| Site | URL | Repo |
|------|-----|------|
| Creator Platform | https://live.taboost.me | TABOOST_Platfrom |
| Shop | https://ceyre-boop.github.io/TABOOST-Shop/ | TABOOST-Shop-temp |
| Bulk Import | /bulk-import-new.html | — |

## Data Flow
1. **Current** sheet → CURRENT.csv → Creator dashboard
2. **Rewards** sheet → REWARDS.csv → Rewards display
3. **History** sheet → HISTORY.csv → Historical data
4. **Products** CSV → Shop product listings
5. **Campaigns** CSV → Shop campaign listings

## Firebase Collections
- `creatorRoster` — 826 documents (usernames)
- `creatorProfiles` — Extended data per creator
- `rewards` — Monthly rewards data

## Automation Status
| Task | Schedule | Status |
|------|----------|--------|
| Creator sync | Daily 10 AM PT | ⚠️ DOWN (7 days) |
| Shop sync | Daily 10 AM PT | ⚠️ DOWN (2 days) |
| Health check | Manual | OK |

## Common Issues & Fixes
**Stale CSV files:**
1. Check Apps Script executions
2. Verify GIDs in script match sheet tabs
3. Check Apps Script quota (20k/day limit)
4. Re-run trigger if disabled

**GitHub Pages 404:**
1. Check for uncommitted changes
2. Verify CORS headers for CSV
3. Confirm branch is main/gh-pages