#!/usr/bin/env python3
"""
Jarvis File Organizer

Solves: File organization chaos
Monitors: Downloads, Desktop, Temp files
Actions: Auto-organizes by type, date, project
"""

import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

class FileOrganizer:
    """
    Organizes files automatically based on rules.
    """
    
    # File type mappings
    FILE_TYPES = {
        'images': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'],
        'documents': ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.md'],
        'spreadsheets': ['.csv', '.xls', '.xlsx', '.ods'],
        'code': ['.py', '.js', '.html', '.css', '.json', '.xml', '.yaml', '.yml'],
        'data': ['.pkl', '.h5', '.db', '.sqlite', '.parquet'],
        'archives': ['.zip', '.tar', '.gz', '.rar', '.7z'],
        'executables': ['.exe', '.msi', '.dmg', '.pkg', '.deb'],
    }
    
    def __init__(self, base_path=None):
        self.base_path = Path(base_path or Path.home() / 'organized')
        self.base_path.mkdir(exist_ok=True)
        
        # Create type folders
        for folder in self.FILE_TYPES.keys():
            (self.base_path / folder).mkdir(exist_ok=True)
        
        # Special folders
        (self.base_path / 'trading_data').mkdir(exist_ok=True)
        (self.base_path / 'projects').mkdir(exist_ok=True)
        (self.base_path / 'temp').mkdir(exist_ok=True)
    
    def scan_and_organize(self, source_path: str, dry_run=True):
        """
        Scan a directory and organize files.
        
        Args:
            source_path: Directory to scan
            dry_run: If True, only show what would be done
        """
        source = Path(source_path)
        if not source.exists():
            print(f"Source path doesn't exist: {source}")
            return
        
        actions = []
        
        for file_path in source.iterdir():
            if file_path.is_dir():
                continue
            
            action = self._classify_file(file_path)
            actions.append(action)
        
        # Report
        print(f"\n📁 Scanning: {source}")
        print(f"   Found: {len(actions)} files\n")
        
        for action in actions:
            print(f"   {action['file'].name[:40]:40} → {action['destination']}")
            
            if not dry_run:
                self._execute_action(action)
        
        if dry_run:
            print(f"\n💡 This was a dry run. Add --execute to actually move files.")
    
    def _classify_file(self, file_path: Path) -> dict:
        """Determine where a file should go."""
        ext = file_path.suffix.lower()
        
        # Check file types
        for folder, extensions in self.FILE_TYPES.items():
            if ext in extensions:
                return {
                    'file': file_path,
                    'destination': folder,
                    'target_path': self.base_path / folder / file_path.name
                }
        
        # Special handling for trading data
        if any(keyword in file_path.name.lower() for keyword in ['trade', 'signal', 'backtest', 'pnl', 'equity']):
            return {
                'file': file_path,
                'destination': 'trading_data',
                'target_path': self.base_path / 'trading_data' / file_path.name
            }
        
        # Default to temp
        return {
            'file': file_path,
            'destination': 'temp',
            'target_path': self.base_path / 'temp' / file_path.name
        }
    
    def _execute_action(self, action: dict):
        """Actually move the file."""
        try:
            shutil.move(str(action['file']), str(action['target_path']))
        except Exception as e:
            print(f"   ⚠️ Error moving {action['file'].name}: {e}")
    
    def organize_downloads(self, dry_run=True):
        """Organize Downloads folder."""
        downloads = Path.home() / 'Downloads'
        self.scan_and_organize(downloads, dry_run)
    
    def organize_desktop(self, dry_run=True):
        """Organize Desktop."""
        desktop = Path.home() / 'Desktop'
        self.scan_and_organize(desktop, dry_run)
    
    def clean_old_files(self, days=30, dry_run=True):
        """Remove or archive files older than N days."""
        temp_folder = self.base_path / 'temp'
        
        old_files = []
        cutoff = datetime.now() - timedelta(days=days)
        
        for file_path in temp_folder.iterdir():
            if file_path.is_file():
                mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                if mtime < cutoff:
                    old_files.append(file_path)
        
        print(f"\n🧹 Cleaning files older than {days} days")
        print(f"   Found: {len(old_files)} files in temp/")
        
        for f in old_files[:10]:
            print(f"   🗑️  {f.name}")
        
        if len(old_files) > 10:
            print(f"   ... and {len(old_files) - 10} more")
        
        if not dry_run:
            for f in old_files:
                f.unlink()
            print(f"   Deleted {len(old_files)} files")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Jarvis File Organizer')
    parser.add_argument('action', choices=['downloads', 'desktop', 'clean', 'status'])
    parser.add_argument('--execute', action='store_true', help='Actually move/delete files')
    parser.add_argument('--days', type=int, default=30, help='Days for clean action')
    
    args = parser.parse_args()
    
    organizer = FileOrganizer()
    
    if args.action == 'downloads':
        organizer.organize_downloads(dry_run=not args.execute)
    elif args.action == 'desktop':
        organizer.organize_desktop(dry_run=not args.execute)
    elif args.action == 'clean':
        organizer.clean_old_files(days=args.days, dry_run=not args.execute)
    elif args.action == 'status':
        print("📊 File Organizer Status")
        print(f"   Base path: {organizer.base_path}")
        for folder in organizer.FILE_TYPES.keys():
            count = len(list((organizer.base_path / folder).iterdir()))
            print(f"   {folder}: {count} files")


if __name__ == '__main__':
    main()
