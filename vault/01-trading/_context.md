---
domain: trading
type: persistent-context
---

# 📈 Trading Context (Always Loaded)

## Strategy Framework: 3-Layer System

### Layer 1 — AI Bias Engine
- **Model**: Transformer on 5-min price action + order flow
- **Input**: Last 100 candles, volume profile, sweep detection
- **Output**: Direction bias (-1 to +1), confidence %
- **Threshold**: Trade only if |bias| > 0.6 AND confidence > 75%

### Layer 2 — Quant Risk Model
- **Position sizing**: 1% risk per trade, max 3 concurrent
- **EV calculation**: (Win% × Reward) - (Loss% × Risk)
- **Minimum EV**: 0.5R to take trade
- **Stop loss**: Technical level (sweep low/high), never >1.5% move

### Layer 3 — Game Theory Engine
- **Liquidity sweep detection**: Equal highs/lows + rapid reclaim
- **Kyle's Lambda**: Market impact measure (target <0.05)
- **Forced move probability**: If >70%, enter on reclaim
- **Adversarial risk**: HFT spoofing detection

## Risk Management Rules
1. ❌ No trades 14:00-15:00 (FOMC window)
2. ❌ No trades if VIX > 30 (unless breakout setup)
3. ❌ No adding to losers (never average down)
4. ✅ Scale out: 50% at 1R, 25% at 2R, runner to target
5. ✅ Move to breakeven after 1R

## Current Broker Setup
- **Platform**: TradeLocker
- **Account**: Demo (Paper trading mode)
- **API**: Enabled, Firebase sync active
- **Symbols Traded**: NAS100, SPY, BTCUSD
- **Max Position Size**: 2 contracts NAS100, 100 shares SPY

## Historical Performance (Last 90 Days)
| Metric | Value |
|--------|-------|
| Total Trades | 47 |
| Win Rate | 58% |
| Avg Winner | +1.8R |
| Avg Loser | -1.0R |
| Expectancy | +0.54R/trade |
| Max Drawdown | -3.2R |
| Current Streak | 2 wins |

## Key Patterns That Work
1. **Liquidity sweep + reclaim** — 72% win rate
2. **Opening drive fade** — 65% win rate (first 30 min only)
3. **VIX expansion mean reversion** — 60% win rate

## Patterns to Avoid
1. Choppy range days (ADX < 20)
2. News-driven gaps without technical setup
3. Counter-trend trades after 11:00 AM

## Current Goals (March 2026)
- [ ] Achieve +10R for month
- [ ] Reduce max drawdown to <2.5R
- [ ] Increase win rate to 62%
- [ ] Complete 3-layer system backtest (5 years)