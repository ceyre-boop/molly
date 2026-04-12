"""
Jarvis Autonomous Monitor

Runs continuously, checks systems, sends alerts via Telegram when issues found.
"""
import os
import sys
import time
import json
import subprocess
import requests
from datetime import datetime, timedelta
from pathlib import Path

# Telegram Bot Config (will be set via env vars or config)
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '8243805747:AAEK6nO-qxxpBRHkPbDjycq-_UJyXWJJGTk')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '8238570901')

class AutonomousMonitor:
    """
    Monitors all systems and sends alerts when issues detected.
    """
    
    def __init__(self):
        self.last_check = {}
        self.alert_cooldown = {}  # Prevent spam
        
    def send_telegram(self, message: str):
        """Send alert via Telegram."""
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {
                'chat_id': TELEGRAM_CHAT_ID,
                'text': message,
                'parse_mode': 'HTML'
            }
            response = requests.post(url, json=payload, timeout=10)
            return response.ok
        except Exception as e:
            print(f"Failed to send Telegram: {e}")
            return False
    
    def check_git_repos(self):
        """Check for uncommitted changes in repos."""
        repos = [
            ('quant', '/workspaces/quant'),
            ('molly', '/workspaces/molly'),
        ]
        
        alerts = []
        for name, path in repos:
            try:
                result = subprocess.run(
                    ['git', 'status', '--porcelain'],
                    capture_output=True,
                    text=True,
                    cwd=path
                )
                
                if result.stdout.strip():
                    changes = len(result.stdout.strip().split('\n'))
                    alerts.append(f"⚠️ <b>{name}</b>: {changes} uncommitted changes")
                    
            except Exception as e:
                alerts.append(f"❌ <b>{name}</b>: Error checking repo - {e}")
        
        return alerts
    
    def check_trading_system(self):
        """Check trading system health."""
        alerts = []
        
        # Check if paper trades log exists
        trades_file = Path('/workspaces/quant/paper_trades.jsonl')
        if not trades_file.exists():
            alerts.append("🚨 <b>Trading:</b> paper_trades.jsonl not found!")
        else:
            # Check if stale (no trades in 24h on trading day)
            mtime = datetime.fromtimestamp(trades_file.stat().st_mtime)
            hours_since = (datetime.now() - mtime).total_seconds() / 3600
            
            if hours_since > 24:
                weekday = datetime.now().weekday()
                if weekday < 5:  # Weekday
                    alerts.append(f"📊 <b>Trading:</b> No trades logged in {hours_since:.0f}h")
        
        # Check for April OOS data (critical)
        april_data = Path('/workspaces/quant/data/april_oos_58signals.csv')
        if not april_data.exists():
            alerts.append("🚨 <b>CRITICAL:</b> April OOS dataset missing - 86% accuracy unverified!")
        
        return alerts
    
    def check_todos(self):
        """Check for urgent todos."""
        alerts = []
        
        # Scan for TODOs in quant codebase
        try:
            result = subprocess.run(
                ['find', '/workspaces/quant', '-name', '*.py', '-exec', 'grep', '-l', 'TODO', '{}', '+'],
                capture_output=True,
                text=True
            )
            
            if result.stdout.strip():
                files = result.stdout.strip().split('\n')
                urgent = [f for f in files if 'XXX' in f or 'FIXME' in f]
                if urgent:
                    alerts.append(f"🔥 <b>URGENT:</b> {len(urgent)} files with XXX/FIXME")
                    
        except Exception:
            pass
        
        return alerts
    
    def check_system_health(self):
        """Check disk space, etc."""
        alerts = []
        
        # Disk space
        import shutil
        total, used, free = shutil.disk_usage('/')
        free_gb = free / (1024**3)
        
        if free_gb < 10:
            alerts.append(f"💾 <b>LOW DISK:</b> Only {free_gb:.1f} GB free!")
        elif free_gb < 50:
            alerts.append(f"💾 <b>DISK:</b> {free_gb:.1f} GB free (getting low)")
        
        return alerts
    
    def run_all_checks(self):
        """Run all monitoring checks and send alerts."""
        all_alerts = []
        
        all_alerts.extend(self.check_git_repos())
        all_alerts.extend(self.check_trading_system())
        all_alerts.extend(self.check_todos())
        all_alerts.extend(self.check_system_health())
        
        if all_alerts:
            # Deduplicate and format
            message = "<b>🤖 JARVIS ALERT</b>\n"
            message += f"<i>{datetime.now().strftime('%Y-%m-%d %H:%M')}</i>\n\n"
            message += "\n\n".join(all_alerts)
            
            # Send alert
            self.send_telegram(message)
            print(f"Sent alert with {len(all_alerts)} issues")
            return True
        else:
            print("All systems OK - no alerts needed")
            return False
    
    def continuous_monitor(self, interval_minutes=30):
        """Run continuous monitoring loop."""
        print(f"🔍 Jarvis Monitor started - checking every {interval_minutes} minutes")
        
        while True:
            try:
                self.run_all_checks()
                
                # Sleep until next check
                print(f"💤 Sleeping {interval_minutes} minutes...")
                time.sleep(interval_minutes * 60)
                
            except KeyboardInterrupt:
                print("\n🛑 Monitor stopped")
                break
            except Exception as e:
                print(f"❌ Error in monitor: {e}")
                time.sleep(60)  # Retry in 1 minute on error


def run_once():
    """Run checks once (for cron/manual)."""
    monitor = AutonomousMonitor()
    found_issues = monitor.run_all_checks()
    return found_issues


def run_continuous():
    """Run continuous monitoring."""
    monitor = AutonomousMonitor()
    monitor.continuous_monitor(interval_minutes=30)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    parser.add_argument('--continuous', action='store_true', help='Run continuously')
    
    args = parser.parse_args()
    
    if args.once:
        run_once()
    elif args.continuous:
        run_continuous()
    else:
        # Default: run once
        run_once()
