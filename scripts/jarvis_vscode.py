#!/usr/bin/env python3
"""
Jarvis VS Code Integration

Solves: Context switching, opening files, managing workspaces
Commands: Open project, open file, switch workspace, run task
"""

import json
import subprocess
import sys
from pathlib import Path

class VSCodeController:
    """
    Controls VS Code programmatically.
    """
    
    PROJECTS = {
        'quant': '/workspaces/quant',
        'molly': '/workspaces/molly',
        'taboost': '/workspaces/taboost',
        'school': '/workspaces/school',
    }
    
    def __init__(self):
        self.code_cmd = self._find_code_command()
    
    def _find_code_command(self) -> str:
        """Find the VS Code command."""
        # Try different possibilities
        for cmd in ['code', 'code-insiders', '/usr/bin/code']:
            try:
                subprocess.run([cmd, '--version'], capture_output=True, check=True)
                return cmd
            except (subprocess.CalledProcessError, FileNotFoundError):
                continue
        return 'code'  # Default fallback
    
    def open_project(self, project_name: str):
        """Open a project folder in VS Code."""
        if project_name not in self.PROJECTS:
            print(f"Unknown project: {project_name}")
            print(f"Available: {', '.join(self.PROJECTS.keys())}")
            return False
        
        path = Path(self.PROJECTS[project_name])
        if not path.exists():
            print(f"Path doesn't exist: {path}")
            return False
        
        subprocess.run([self.code_cmd, str(path)])
        print(f"Opened {project_name} in VS Code")
        return True
    
    def open_file(self, filepath: str, line: int = None):
        """Open a specific file, optionally at a line number."""
        path = Path(filepath)
        
        if not path.exists():
            # Try relative to current project
            print(f"File not found: {filepath}")
            return False
        
        args = [self.code_cmd, str(path)]
        if line:
            args.extend(['--goto', f'{path}:{line}'])
        
        subprocess.run(args)
        return True
    
    def open_recent(self):
        """Show recent folders and open one."""
        # Get recent folders from VS Code state
        state_file = Path.home() / '.config' / 'Code' / 'storage.json'
        
        if not state_file.exists():
            print("VS Code state file not found")
            return
        
        try:
            with open(state_file, 'r') as f:
                state = json.load(f)
            
            recent = state.get('lastKnownWorkspaceFolders', [])
            
            print("Recent workspaces:")
            for i, folder in enumerate(recent[:5], 1):
                print(f"  {i}. {folder}")
        
        except Exception as e:
            print(f"Error reading state: {e}")
    
    def run_task(self, project: str, task_name: str):
        """Run a VS Code task."""
        # Requires VS Code CLI with --command
        subprocess.run([
            self.code_cmd,
            '--folder-uri', f'file://{self.PROJECTS[project]}',
            '--command', f'workbench.action.tasks.runTask',
        ])
    
    def search(self, query: str, project: str = None):
        """Search across files."""
        # Use VS Code's search
        args = [self.code_cmd, '--command', 'workbench.action.findInFiles']
        
        if project:
            args.extend(['--folder-uri', f'file://{self.PROJECTS[project]}'])
        
        subprocess.run(args)
        print(f"Search opened for: {query}")
    
    def command_palette(self):
        """Open command palette."""
        subprocess.run([self.code_cmd, '--command', 'workbench.action.showCommands'])
    
    def new_window(self):
        """Open new VS Code window."""
        subprocess.run([self.code_cmd, '--new-window'])


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Jarvis VS Code Controller')
    parser.add_argument('action', choices=[
        'open', 'file', 'recent', 'task', 'search', 'palette', 'new'
    ])
    parser.add_argument('--project', help='Project name')
    parser.add_argument('--file', help='File path')
    parser.add_argument('--line', type=int, help='Line number')
    parser.add_argument('--query', help='Search query')
    
    args = parser.parse_args()
    
    vscode = VSCodeController()
    
    if args.action == 'open':
        if not args.project:
            print("Error: --project required")
            sys.exit(1)
        vscode.open_project(args.project)
    
    elif args.action == 'file':
        if not args.file:
            print("Error: --file required")
            sys.exit(1)
        vscode.open_file(args.file, args.line)
    
    elif args.action == 'recent':
        vscode.open_recent()
    
    elif args.action == 'task':
        if not args.project:
            print("Error: --project required")
            sys.exit(1)
        vscode.run_task(args.project, 'default')
    
    elif args.action == 'search':
        vscode.search(args.query or '', args.project)
    
    elif args.action == 'palette':
        vscode.command_palette()
    
    elif args.action == 'new':
        vscode.new_window()


if __name__ == '__main__':
    main()
