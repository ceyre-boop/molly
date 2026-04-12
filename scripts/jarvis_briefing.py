#!/usr/bin/env python3
"""
Jarvis Daily Briefing

Solves: Starting day without context
Prepares: Daily summary of what needs attention
Integrates: GitHub, file system, trading systems, todos
"""

import json
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

class DailyBriefing:
    """
    Generates a morning briefing of everything that needs attention.
    """
    
    def __init__(self):
        self.briefing = {
            'generated_at': datetime.now().isoformat(),
            'sections': []
        }
    
    def generate(self) -> str:
        """Generate full daily briefing."""
        sections = []
        
        sections.append(self._trading_status())
        sections.append(self._project_status())
        sections.append(self._todo_summary())
        sections.append(self._github_activity())
        sections.append(self._system_health())
        
        return "\n\n".join(sections)
    
    def _trading_status(self) -> str:
        """Check trading system status."""
        lines = ["TRADING SYSTEM", "="*50]
        
        # Check if paper_trades.jsonl exists and has recent entries
        trades_file = Path('/workspaces/quant/paper_trades.jsonl')
        
        if trades_file.exists():
            lines.append(f"Paper trades log: [OK] Found")
            
            # Count today's trades
            today = datetime.now().strftime('%Y-%m-%d')
            trades_today = 0
            
            with open(trades_file, 'r') as f:
                for line in f:
                    if today in line:
                        trades_today += 1
            
            lines.append(f"Trades today: {trades_today}")
            
            if trades_today == 0:
                lines.append("[INFO] No trades yet. Check if markets are open.")
        else:
            lines.append("⚠️  Paper trades log not found")
        
        # Check Monday protocol status
        weekday = datetime.now().weekday()
        if weekday == 0:  # Monday
            lines.append("[*] Today is Monday - NY Open protocol active")
            lines.append("   Run: python check_monday_premarket.py (8:45 AM)")
        
        return "\n".join(lines)
    
    def _project_status(self) -> str:
        """Check recent activity in projects."""
        lines = ["📁 PROJECTS", "="*50]
        
        projects = {
            'quant': '/workspaces/quant',
            'molly': '/workspaces/molly',
        }
        
        for name, path in projects.items():
            proj_path = Path(path)
            if proj_path.exists():
                # Find most recently modified file
                recent_files = []
                for f in proj_path.rglob('*'):
                    if f.is_file() and '.git' not in str(f):
                        recent_files.append((f, f.stat().st_mtime))
                
                if recent_files:
                    recent_files.sort(key=lambda x: x[1], reverse=True)
                    latest = recent_files[0]
                    mtime = datetime.fromtimestamp(latest[1])
                    hours_ago = (datetime.now() - mtime).total_seconds() / 3600
                    
                    if hours_ago < 24:
                        lines.append(f"{name:10} [OK] Active ({hours_ago:.0f}h ago)")
                    else:
                        lines.append(f"{name:10} [!] Stale ({hours_ago:.0f}h ago)")
        
        return "\n".join(lines)
    
    def _todo_summary(self) -> str:
        """Summarize todos across all systems."""
        lines = ["TODOS", "="*50]
        
        # Check for todo files in various locations
        todo_locations = [
            Path.home() / 'todos.txt',
            Path('/workspaces/quant/todos.txt'),
            Path('/workspaces/molly/vault/todos.md'),
        ]
        
        total_todos = 0
        for todo_file in todo_locations:
            if todo_file.exists():
                with open(todo_file, 'r') as f:
                    content = f.read()
                    # Count unchecked items
                    unchecked = content.count('☐') + content.count('- [ ]') + content.count('[ ]')
                    total_todos += unchecked
                    if unchecked > 0:
                        lines.append(f"{todo_file.parent.name}: {unchecked} pending")
        
        if total_todos == 0:
            lines.append("No todos found (or all complete ✓)")
        else:
            lines.append(f"\nTotal: {total_todos} todos pending")
        
        return "\n".join(lines)
    
    def _github_activity(self) -> str:
        """Check recent GitHub activity."""
        lines = ["GITHUB", "="*50]
        
        try:
            # Check for uncommitted changes
            result = subprocess.run(
                ['git', 'status', '--porcelain'],
                capture_output=True,
                text=True,
                cwd='/workspaces/quant'
            )
            
            if result.stdout.strip():
                changes = len(result.stdout.strip().split('\n'))
                lines.append(f"[!] {changes} uncommitted changes in quant/")
            else:
                lines.append("[OK] Working directory clean")
            
            # Check recent commits
            result = subprocess.run(
                ['git', 'log', '--oneline', '-5'],
                capture_output=True,
                text=True,
                cwd='/workspaces/quant'
            )
            
            if result.stdout:
                lines.append("\nRecent commits:")
                for line in result.stdout.strip().split('\n')[:3]:
                    lines.append(f"  {line}")
        
        except Exception as e:
            lines.append(f"Could not check git: {e}")
        
        return "\n".join(lines)
    
    def _system_health(self) -> str:
        """Check overall system health."""
        lines = ["SYSTEM", "="*50]
        
        import shutil
        
        # Disk space
        total, used, free = shutil.disk_usage('/')
        free_gb = free / (1024**3)
        
        if free_gb < 10:
            lines.append(f"[!] Low disk space: {free_gb:.1f} GB free")
        else:
            lines.append(f"[OK] Disk space: {free_gb:.1f} GB free")
        
        # Check if important scripts exist
        scripts = [
            '/workspaces/quant/check_monday_premarket.py',
            '/workspaces/quant/execute_monday_killzone.py',
        ]
        
        missing = [s for s in scripts if not Path(s).exists()]
        if missing:
            lines.append(f"[!] Missing scripts: {', '.join(Path(m).name for m in missing)}")
        else:
            lines.append("[OK] All trading scripts present")
        
        return "\n".join(lines)


def main():
    import sys
    
    briefing = DailyBriefing()
    output = briefing.generate()
    
    print(output)
    
    # Save to file
    briefings_dir = Path.home() / '.jarvis' / 'briefings'
    briefings_dir.mkdir(parents=True, exist_ok=True)
    
    date_str = datetime.now().strftime('%Y-%m-%d')
    brief_file = briefings_dir / f'briefing_{date_str}.txt'
    
    with open(brief_file, 'w', encoding='utf-8') as f:
        f.write(output)
    
    print(f"\n\nSaved to: {brief_file}")


if __name__ == '__main__':
    main()
