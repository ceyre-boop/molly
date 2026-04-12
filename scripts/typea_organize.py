#!/usr/bin/env python3
"""
Type A File Organization System

Military-grade structure for scattered files.
Organizes by domain, date, and purpose.
"""

import os
import shutil
import json
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
import re

class TypeAOrganizer:
    """
    Organizes files with extreme prejudice.
    """
    
    # Master directory structure
    STRUCTURE = {
        '00_INBOX': 'Temporary landing zone - process daily',
        '01_PROJECTS': {
            'active': 'Currently working on',
            'archive': 'Completed projects',
            'templates': 'Reusable templates'
        },
        '02_DOMAINS': {
            'trading': 'Quant trading, analysis, data',
            'agency': 'TABOOST, creators, business',
            'dev': 'Development, coding, tools',
            'school': 'Academic, coursework',
            'personal': 'Personal docs, finance, health'
        },
        '03_RESOURCES': {
            'data': 'CSV, databases, datasets',
            'docs': 'PDFs, manuals, references',
            'media': 'Images, videos, audio',
            'software': 'Installers, ISOs, tools'
        },
        '04_ARCHIVE': {
            '2024': 'Old files by year',
            '2025': 'Old files by year',
        },
        '99_TEMP': 'Trash - delete weekly'
    }
    
    # File type mappings
    FILE_TYPES = {
        'code': ['.py', '.js', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.sql'],
        'data': ['.csv', '.xlsx', '.xls', '.pkl', '.h5', '.db', '.sqlite', '.parquet', '.json'],
        'docs': ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.epub'],
        'media': ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mp3', '.wav', '.svg'],
        'archives': ['.zip', '.tar', '.gz', '.rar', '.7z'],
        'executables': ['.exe', '.msi', '.dmg', '.pkg', '.deb', '.app']
    }
    
    # Project detection keywords
    PROJECT_KEYWORDS = {
        'trading': ['trade', 'quant', 'signal', 'backtest', 'pnl', 'equity', 'strategy', 'hurst'],
        'agency': ['taboost', 'creator', 'client', 'campaign', 'tiktok', 'agency'],
        'dev': ['code', 'script', 'app', 'api', 'github', 'repo', 'dev'],
        'school': ['class', 'course', 'assignment', 'homework', 'university', 'canvas']
    }
    
    def __init__(self, base_path=None):
        self.base = Path(base_path or Path.home() / 'organized_life')
        self.stats = {'moved': 0, 'skipped': 0, 'errors': []}
        self.plan = []  # Store planned moves for dry-run
        
    def create_structure(self):
        """Create the master directory structure."""
        print("Creating Type A directory structure...")
        
        def create_recursive(path_dict, current_path):
            for name, value in path_dict.items():
                full_path = current_path / name
                if isinstance(value, dict):
                    full_path.mkdir(parents=True, exist_ok=True)
                    create_recursive(value, full_path)
                else:
                    full_path.mkdir(parents=True, exist_ok=True)
                    # Create README in each folder
                    readme = full_path / '_README.txt'
                    if not readme.exists():
                        readme.write_text(f"{value}\n\nOrganized: {datetime.now().isoformat()}\n")
        
        create_recursive(self.STRUCTURE, self.base)
        print(f"Structure created at: {self.base}")
        
    def analyze_file(self, file_path: Path) -> dict:
        """Analyze a file to determine where it belongs."""
        info = {
            'path': file_path,
            'name': file_path.name,
            'ext': file_path.suffix.lower(),
            'size': file_path.stat().st_size,
            'modified': datetime.fromtimestamp(file_path.stat().st_mtime),
            'category': 'unknown',
            'domain': 'personal',
            'destination': None
        }
        
        # Determine file category
        for cat, exts in self.FILE_TYPES.items():
            if info['ext'] in exts:
                info['category'] = cat
                break
        
        # Determine domain from filename/content
        name_lower = file_path.name.lower()
        for domain, keywords in self.PROJECT_KEYWORDS.items():
            if any(kw in name_lower for kw in keywords):
                info['domain'] = domain
                break
        
        # Special handling for trading data
        if info['domain'] == 'trading' or info['category'] == 'data':
            if any(x in name_lower for x in ['signal', 'trade', 'backtest', 'pnl']):
                info['destination'] = self.base / '02_DOMAINS' / 'trading' / 'data'
            else:
                info['destination'] = self.base / '03_RESOURCES' / 'data'
        
        # Code files go to appropriate domain
        elif info['category'] == 'code':
            info['destination'] = self.base / '02_DOMAINS' / info['domain'] / 'code'
        
        # Documents
        elif info['category'] == 'docs':
            info['destination'] = self.base / '02_DOMAINS' / info['domain'] / 'docs'
        
        # Archives
        elif info['category'] == 'archives':
            info['destination'] = self.base / '03_RESOURCES' / 'archives'
        
        # Media
        elif info['category'] == 'media':
            if info['domain'] == 'trading':
                info['destination'] = self.base / '02_DOMAINS' / 'trading' / 'charts'
            else:
                info['destination'] = self.base / '03_RESOURCES' / 'media'
        
        # Old files go to archive
        age_days = (datetime.now() - info['modified']).days
        if age_days > 365 and not info['destination']:
            year = info['modified'].year
            info['destination'] = self.base / '04_ARCHIVE' / str(year)
        
        # Default destination
        if not info['destination']:
            info['destination'] = self.base / '00_INBOX'
        
        return info
    
    def scan_and_plan(self, source_dirs: list) -> list:
        """Scan directories and create organization plan."""
        print(f"\nScanning {len(source_dirs)} directories...")
        
        plan = []
        for source in source_dirs:
            source_path = Path(source).expanduser()
            if not source_path.exists():
                print(f"  [!] Skipping: {source} (not found)")
                continue
            
            print(f"  Scanning: {source}")
            
            for item in source_path.rglob('*'):
                if item.is_file():
                    # Skip system files
                    if item.name.startswith('.') or item.name.startswith('~'):
                        continue
                    
                    info = self.analyze_file(item)
                    info['source'] = source_path.name
                    plan.append(info)
        
        print(f"  Found {len(plan)} files to organize")
        return plan
    
    def execute_plan(self, plan: list, dry_run=True):
        """Execute the organization plan."""
        print(f"\n{'DRY RUN - ' if dry_run else ''}Organizing {len(plan)} files...")
        
        for info in plan:
            try:
                dest = info['destination']
                dest.mkdir(parents=True, exist_ok=True)
                
                # Handle filename collisions
                target = dest / info['name']
                counter = 1
                original_target = target
                while target.exists() and not dry_run:
                    stem = original_target.stem
                    suffix = original_target.suffix
                    target = dest / f"{stem}_{counter}{suffix}"
                    counter += 1
                
                if dry_run:
                    print(f"  [PLAN] {info['name'][:40]:40} -> {dest}")
                    self.stats['moved'] += 1
                else:
                    shutil.move(str(info['path']), str(target))
                    print(f"  [MOVED] {info['name'][:40]:40} -> {dest}")
                    self.stats['moved'] += 1
                    
            except Exception as e:
                self.stats['errors'].append(f"{info['name']}: {e}")
                print(f"  [ERROR] {info['name']}: {e}")
    
    def generate_report(self):
        """Generate organization report."""
        report = []
        report.append("=" * 60)
        report.append("TYPE A ORGANIZATION REPORT")
        report.append(f"Generated: {datetime.now().isoformat()}")
        report.append("=" * 60)
        report.append(f"")
        report.append(f"Files processed: {self.stats['moved']}")
        report.append(f"Errors: {len(self.stats['errors'])}")
        report.append(f"")
        
        if self.stats['errors']:
            report.append("ERRORS:")
            for err in self.stats['errors'][:10]:
                report.append(f"  - {err}")
        
        report.append(f"")
        report.append("NEW STRUCTURE:")
        report.append(f"  {self.base}")
        
        return "\n".join(report)
    
    def organize(self, source_dirs: list, dry_run=True):
        """Main organization workflow."""
        print("╔══════════════════════════════════════════════════════════╗")
        print("║     TYPE A FILE ORGANIZATION SYSTEM                      ║")
        print("║     Military-grade structure for scattered files        ║")
        print("╚══════════════════════════════════════════════════════════╝")
        
        # Create structure
        self.create_structure()
        
        # Scan and plan
        plan = self.scan_and_plan(source_dirs)
        
        if not plan:
            print("\nNo files found to organize!")
            return
        
        # Show summary
        domains = defaultdict(int)
        categories = defaultdict(int)
        for info in plan:
            domains[info['domain']] += 1
            categories[info['category']] += 1
        
        print("\n--- ORGANIZATION PREVIEW ---")
        print("\nBy Domain:")
        for domain, count in sorted(domains.items(), key=lambda x: -x[1]):
            print(f"  {domain:12} : {count:4} files")
        
        print("\nBy Category:")
        for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
            print(f"  {cat:12} : {count:4} files")
        
        # Execute
        if dry_run:
            print("\n--- DRY RUN (no files moved) ---")
        
        self.execute_plan(plan, dry_run=dry_run)
        
        # Report
        report = self.generate_report()
        print("\n" + report)
        
        # Save report
        report_file = self.base / '_organization_report.txt'
        with open(report_file, 'w') as f:
            f.write(report)
        
        print(f"\nReport saved: {report_file}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Type A File Organization')
    parser.add_argument('--sources', nargs='+', default=['~/Downloads', '~/Desktop'],
                        help='Directories to organize')
    parser.add_argument('--execute', action='store_true',
                        help='Actually move files (default is dry-run)')
    parser.add_argument('--base', default=None,
                        help='Base organization directory')
    
    args = parser.parse_args()
    
    organizer = TypeAOrganizer(base_path=args.base)
    organizer.organize(args.sources, dry_run=not args.execute)
    
    if not args.execute:
        print("\n" + "=" * 60)
        print("This was a DRY RUN. No files were moved.")
        print("Add --execute to actually organize files.")
        print("=" * 60)


if __name__ == '__main__':
    main()
