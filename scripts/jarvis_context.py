#!/usr/bin/env python3
"""
Jarvis Core - Project Context Manager

Solves: Context switching between projects
Monitors: What you're working on, suggests next actions
Integrates: VS Code, Terminal, File system
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

class ProjectContextManager:
    """
    Tracks which project you're in and what you were doing.
    Provides instant context recovery when you switch back.
    """
    
    PROJECTS = {
        'quant': '/workspaces/quant',
        'molly': '/workspaces/molly',
        'taboost': '/workspaces/taboost',
        'school': '/workspaces/school',
    }
    
    def __init__(self, state_file='~/.jarvis/project_context.json'):
        self.state_file = Path(state_file).expanduser()
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.context = self._load_context()
    
    def _load_context(self) -> Dict:
        """Load saved context or create new."""
        if self.state_file.exists():
            with open(self.state_file, 'r') as f:
                return json.load(f)
        return {
            'active_project': None,
            'last_switch': None,
            'projects': {p: {'last_active': None, 'open_files': [], 'todos': []} for p in self.PROJECTS}
        }
    
    def _save_context(self):
        """Save current context."""
        with open(self.state_file, 'w') as f:
            json.dump(self.context, f, indent=2, default=str)
    
    def detect_active_project(self) -> Optional[str]:
        """
        Detect which project you're currently in.
        Checks: current working directory, recent VS Code windows, git activity
        """
        cwd = Path.cwd()
        
        for name, path in self.PROJECTS.items():
            if str(cwd).startswith(path):
                return name
        
        # Check VS Code recent workspaces
        vscode_state = Path.home() / '.config/Code/storage.json'
        if vscode_state.exists():
            # Parse VS Code state for open folders
            pass  # Implementation here
        
        return self.context.get('active_project')
    
    def switch_project(self, project_name: str):
        """
        Switch to a project. Saves current state, restores new context.
        """
        current = self.context.get('active_project')
        
        if current:
            # Save current project state
            self._capture_project_state(current)
        
        # Update context
        self.context['active_project'] = project_name
        self.context['last_switch'] = datetime.now().isoformat()
        self.context['projects'][project_name]['last_active'] = datetime.now().isoformat()
        
        self._save_context()
        
        # Restore new project context
        self._restore_project_state(project_name)
        
        return self.get_project_summary(project_name)
    
    def _capture_project_state(self, project_name: str):
        """Capture current state of a project."""
        project_ctx = self.context['projects'][project_name]
        
        # Capture open files (VS Code)
        # Capture terminal history
        # Capture recent git activity
        # Capture open browser tabs
        
        project_ctx['last_capture'] = datetime.now().isoformat()
    
    def _restore_project_state(self, project_name: str):
        """Restore a project to its saved state."""
        project_ctx = self.context['projects'][project_name]
        
        print(f"\n🔄 Switching to {project_name.upper()}")
        print(f"   Last active: {project_ctx.get('last_active', 'Never')}")
        print(f"\n   Quick actions:")
        print(f"   cd {self.PROJECTS[project_name]}")
        
        if project_ctx.get('open_files'):
            print(f"\n   Open files:")
            for f in project_ctx['open_files'][:5]:
                print(f"   - {f}")
        
        if project_ctx.get('todos'):
            print(f"\n   Pending todos:")
            for t in project_ctx['todos'][:3]:
                print(f"   ☐ {t}")
    
    def get_project_summary(self, project_name: str) -> Dict:
        """Get summary of a project's current state."""
        ctx = self.context['projects'][project_name]
        path = Path(self.PROJECTS[project_name])
        
        # Count recent files
        recent_files = []
        if path.exists():
            for f in path.rglob('*'):
                if f.is_file() and f.stat().st_mtime > (datetime.now() - timedelta(days=7)).timestamp():
                    recent_files.append(f)
        
        return {
            'name': project_name,
            'path': str(path),
            'last_active': ctx.get('last_active'),
            'recent_files': len(recent_files),
            'todos_count': len(ctx.get('todos', [])),
        }
    
    def suggest_next_project(self) -> Optional[str]:
        """Suggest which project to work on based on patterns."""
        # Find project with oldest last_active
        oldest = None
        oldest_time = datetime.now()
        
        for name, ctx in self.context['projects'].items():
            if ctx.get('last_active'):
                last = datetime.fromisoformat(ctx['last_active'])
                if last < oldest_time:
                    oldest_time = last
                    oldest = name
        
        return oldest


class ContextSwitcher:
    """CLI interface for project switching."""
    
    def __init__(self):
        self.manager = ProjectContextManager()
    
    def status(self):
        """Show current context status."""
        active = self.manager.context.get('active_project')
        
        print("="*60)
        print("JARVIS PROJECT CONTEXT")
        print("="*60)
        
        print(f"\n🎯 Active: {active or 'None detected'}")
        
        print(f"\n📁 Projects:")
        for name in self.manager.PROJECTS:
            summary = self.manager.get_project_summary(name)
            marker = "→" if name == active else " "
            last = summary['last_active'][:10] if summary['last_active'] else "Never"
            print(f"  {marker} {name:10} | Last: {last} | Recent: {summary['recent_files']} files")
        
        suggestion = self.manager.suggest_next_project()
        if suggestion and suggestion != active:
            print(f"\n💡 Suggestion: Work on '{suggestion}' (hasn't been active recently)")
    
    def switch(self, project_name: str):
        """Switch to a project."""
        if project_name not in self.manager.PROJECTS:
            print(f"Unknown project: {project_name}")
            print(f"Available: {', '.join(self.manager.PROJECTS.keys())}")
            return
        
        summary = self.manager.switch_project(project_name)
    
    def workon(self, keyword: str):
        """Fuzzy find and switch to project matching keyword."""
        matches = [p for p in self.manager.PROJECTS if keyword.lower() in p.lower()]
        
        if len(matches) == 1:
            self.switch(matches[0])
        elif len(matches) > 1:
            print(f"Multiple matches: {', '.join(matches)}")
        else:
            print(f"No project matches '{keyword}'")


if __name__ == '__main__':
    import sys
    
    switcher = ContextSwitcher()
    
    if len(sys.argv) < 2:
        switcher.status()
    elif sys.argv[1] == 'switch' and len(sys.argv) > 2:
        switcher.switch(sys.argv[2])
    elif sys.argv[1] == 'workon' and len(sys.argv) > 2:
        switcher.workon(sys.argv[2])
    else:
        # Try to interpret as project name
        switcher.switch(sys.argv[1])
