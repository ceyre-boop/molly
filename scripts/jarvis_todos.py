#!/usr/bin/env python3
"""
Jarvis Todo Tracker

Solves: Todos scattered across tools
Integrates: GitHub issues, VS Code, files, trading system
Tracks: What needs doing, what's blocked, what's urgent
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

class TodoItem:
    def __init__(self, text: str, source: str, priority: str = 'normal', 
                 project: str = None, tags: List[str] = None):
        self.text = text
        self.source = source
        self.priority = priority
        self.project = project
        self.tags = tags or []
        self.created = datetime.now().isoformat()
        self.completed = False
    
    def to_dict(self):
        return {
            'text': self.text,
            'source': self.source,
            'priority': self.priority,
            'project': self.project,
            'tags': self.tags,
            'created': self.created,
            'completed': self.completed,
        }


class TodoTracker:
    """
    Unified todo tracker across all tools.
    """
    
    def __init__(self, state_file='~/.jarvis/todos.json'):
        self.state_file = Path(state_file).expanduser()
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.todos = self._load_todos()
    
    def _load_todos(self) -> List[TodoItem]:
        """Load todos from state file."""
        if self.state_file.exists():
            with open(self.state_file, 'r') as f:
                data = json.load(f)
                return [TodoItem(**t) for t in data]
        return []
    
    def _save_todos(self):
        """Save todos to state file."""
        with open(self.state_file, 'w') as f:
            json.dump([t.to_dict() for t in self.todos], f, indent=2)
    
    def scan_all_sources(self):
        """
        Scan all todo sources and aggregate.
        """
        new_todos = []
        
        # Scan code files for TODO comments
        new_todos.extend(self._scan_code_todos())
        
        # Scan markdown files for todos
        new_todos.extend(self._scan_markdown_todos())
        
        # Scan trading system for todos
        new_todos.extend(self._scan_trading_todos())
        
        # Add new todos, avoid duplicates
        for todo in new_todos:
            if not any(t.text == todo.text for t in self.todos):
                self.todos.append(todo)
        
        self._save_todos()
        
        return len(new_todos)
    
    def _scan_code_todos(self) -> List[TodoItem]:
        """Scan code files for TODO/FIXME comments."""
        todos = []
        
        project_paths = [
            '/workspaces/quant',
            '/workspaces/molly',
        ]
        
        for project_path in project_paths:
            path = Path(project_path)
            if not path.exists():
                continue
            
            for file_path in path.rglob('*.py'):
                if '.git' in str(file_path):
                    continue
                
                try:
                    with open(file_path, 'r') as f:
                        content = f.read()
                    
                    # Find TODO/FIXME comments
                    todo_pattern = r'#\s*(TODO|FIXME|HACK|XXX)[\s:]*(.+)'
                    matches = re.finditer(todo_pattern, content, re.IGNORECASE)
                    
                    for match in matches:
                        tag = match.group(1).upper()
                        text = match.group(2).strip()
                        
                        # Determine priority
                        priority = 'high' if tag in ['FIXME', 'XXX'] else 'normal'
                        if 'URGENT' in text.upper() or 'CRITICAL' in text.upper():
                            priority = 'urgent'
                        
                        todos.append(TodoItem(
                            text=f"[{tag}] {text}",
                            source=str(file_path.relative_to(path)),
                            priority=priority,
                            project=path.name
                        ))
                
                except Exception:
                    continue
        
        return todos
    
    def _scan_markdown_todos(self) -> List[TodoItem]:
        """Scan markdown files for checkbox todos."""
        todos = []
        
        md_paths = [
            Path('/workspaces/molly/vault'),
            Path('/workspaces/quant'),
        ]
        
        for base_path in md_paths:
            if not base_path.exists():
                continue
            
            for md_file in base_path.rglob('*.md'):
                try:
                    with open(md_file, 'r') as f:
                        content = f.read()
                    
                    # Find unchecked items: - [ ] or * [ ]
                    pattern = r'^[\s]*[-*]\s*\[\s*\]\s*(.+)$'
                    matches = re.finditer(pattern, content, re.MULTILINE)
                    
                    for match in matches:
                        text = match.group(1).strip()
                        
                        # Check for priority markers
                        priority = 'normal'
                        if any(p in text.upper() for p in ['URGENT', 'CRITICAL', 'BLOCKING']):
                            priority = 'urgent'
                        elif any(p in text.upper() for p in ['LOW', 'MINOR', 'NICE']):
                            priority = 'low'
                        
                        todos.append(TodoItem(
                            text=text,
                            source=str(md_file.relative_to(base_path)),
                            priority=priority,
                            project=base_path.name
                        ))
                
                except Exception:
                    continue
        
        return todos
    
    def _scan_trading_todos(self) -> List[TodoItem]:
        """Scan trading system for pending items."""
        todos = []
        
        # Check for April OOS data (from earlier session)
        if not Path('/workspaces/quant/data/april_oos_58signals.csv').exists():
            todos.append(TodoItem(
                text="Provide April 1-9 OOS dataset for 86.33% accuracy verification",
                source="trading/accuracy_validation",
                priority='high',
                project='quant',
                tags=['data', 'verification']
            ))
        
        return todos
    
    def list_todos(self, project=None, priority=None, tag=None):
        """List todos with optional filters."""
        filtered = [t for t in self.todos if not t.completed]
        
        if project:
            filtered = [t for t in filtered if t.project == project]
        if priority:
            filtered = [t for t in filtered if t.priority == priority]
        if tag:
            filtered = [t for t in filtered if tag in t.tags]
        
        # Sort by priority
        priority_order = {'urgent': 0, 'high': 1, 'normal': 2, 'low': 3}
        filtered.sort(key=lambda t: priority_order.get(t.priority, 2))
        
        return filtered
    
    def complete_todo(self, index: int):
        """Mark a todo as complete by index."""
        active = [t for t in self.todos if not t.completed]
        if 0 <= index < len(active):
            todo = active[index]
            todo.completed = True
            self._save_todos()
            return todo
        return None
    
    def add_todo(self, text: str, project: str = None, priority: str = 'normal'):
        """Manually add a todo."""
        todo = TodoItem(text=text, source='manual', priority=priority, project=project)
        self.todos.append(todo)
        self._save_todos()
        return todo


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Jarvis Todo Tracker')
    parser.add_argument('action', choices=['scan', 'list', 'add', 'done'])
    parser.add_argument('--project', help='Filter by project')
    parser.add_argument('--priority', help='Filter by priority')
    parser.add_argument('--text', help='Todo text (for add)')
    parser.add_argument('--index', type=int, help='Todo index (for done)')
    
    args = parser.parse_args()
    
    tracker = TodoTracker()
    
    if args.action == 'scan':
        count = tracker.scan_all_sources()
        print(f"Scanned and found {count} new todos")
    
    elif args.action == 'list':
        todos = tracker.list_todos(project=args.project, priority=args.priority)
        
        if not todos:
            print("No pending todos found")
            return
        
        print(f"\n📋 TODOS ({len(todos)} pending)\n")
        
        current_project = None
        for i, todo in enumerate(todos):
            if todo.project != current_project:
                current_project = todo.project
                print(f"\n{current_project.upper()}:")
            
            priority_icon = {'urgent': '🔴', 'high': '🟠', 'normal': '⚪', 'low': '⚫'}
            icon = priority_icon.get(todo.priority, '⚪')
            
            print(f"  {i}. {icon} {todo.text[:60]}")
            print(f"     Source: {todo.source}")
    
    elif args.action == 'add':
        if not args.text:
            print("Error: --text required")
            return
        tracker.add_todo(args.text, project=args.project, priority=args.priority or 'normal')
        print("Todo added")
    
    elif args.action == 'done':
        if args.index is None:
            print("Error: --index required")
            return
        todo = tracker.complete_todo(args.index)
        if todo:
            print(f"✓ Completed: {todo.text[:50]}...")
        else:
            print("Invalid index")


if __name__ == '__main__':
    main()
