#!/usr/bin/env python3
"""
Type A Organization - Windows Setup

Analyzes and reorganizes your actual Windows folders.
"""
import os
from pathlib import Path
from datetime import datetime

def get_windows_folders():
    """Get standard Windows user folders."""
    home = Path.home()
    
    return {
        'downloads': home / 'Downloads',
        'desktop': home / 'Desktop',
        'documents': home / 'Documents',
        'pictures': home / 'Pictures',
        'videos': home / 'Videos',
        'workspace': home / 'workspace' if (home / 'workspace').exists() else None,
        'projects': home / 'projects' if (home / 'projects').exists() else None,
    }

def analyze_current_state():
    """Analyze current folder chaos."""
    folders = get_windows_folders()
    
    print("=" * 70)
    print("TYPE A FOLDER ANALYSIS")
    print("=" * 70)
    
    total_files = 0
    total_size = 0
    
    for name, path in folders.items():
        if path and path.exists():
            files = list(path.rglob('*'))
            file_count = len([f for f in files if f.is_file()])
            size = sum(f.stat().st_size for f in files if f.is_file())
            
            total_files += file_count
            total_size += size
            
            size_mb = size / (1024 * 1024)
            print(f"\n{name.upper():12}: {file_count:5} files | {size_mb:7.1f} MB")
            print(f"  Location: {path}")
    
    print(f"\n{'TOTAL':12}: {total_files:5} files | {total_size/(1024*1024):7.1f} MB")
    
    return total_files

def create_typea_structure(base_path: Path):
    """Create the Type A folder structure."""
    
    structure = {
        '00_INBOX': 'Process daily - temporary files',
        '01_ACTIVE_PROJECTS': {
            'TRADING': {
                'quant-system': 'Trading system code',
                'data': 'Market data, signals',
                'analysis': 'Research, notebooks',
                'docs': 'Strategies, notes'
            },
            'AGENCY': {
                'TABOOST': 'Platform code',
                'clients': 'Creator data',
                'campaigns': 'Active campaigns'
            },
            'DEV': {
                'molly': 'Workflow automation',
                'tools': 'Utilities, scripts',
                'experiments': 'Test projects'
            },
            'SCHOOL': {
                'coursework': 'Current classes',
                'assignments': 'Due this week',
                'resources': 'Textbooks, refs'
            }
        },
        '02_RESOURCES': {
            'data': 'CSV, databases',
            'docs': 'PDFs, manuals',
            'media': 'Images, videos',
            'software': 'Installers, tools'
        },
        '03_ARCHIVE': {
            '2024': 'Completed 2024',
            '2025_Q1': 'Q1 completed',
            '2025_Q2': 'Q2 completed',
        },
        '99_TEMP': 'DELETE WEEKLY - trash'
    }
    
    def create_recursive(dictionary, parent):
        for name, value in dictionary.items():
            path = parent / name
            if isinstance(value, dict):
                path.mkdir(parents=True, exist_ok=True)
                create_recursive(value, path)
            else:
                path.mkdir(parents=True, exist_ok=True)
                # Add readme
                readme = path / '_about.txt'
                if not readme.exists():
                    readme.write_text(f"{value}\nCreated: {datetime.now().isoformat()}\n")
    
    create_recursive(structure, base_path)
    print(f"\nType A structure created: {base_path}")

def generate_migration_plan():
    """Generate plan for moving files to new structure."""
    
    plan = """
MIGRATION PLAN - Type A Organization
====================================

STEP 1: Create new structure
  Run: python typea_organize.py
  This creates ~/organized_life/ with proper folders

STEP 2: Move active projects
  QUANT/TRADING:
    - C:\workspaces\quant\ --> 01_ACTIVE_PROJECTS\TRADING\quant-system\
    - Any .pkl, .csv files --> 01_ACTIVE_PROJECTS\TRADING\data\
  
  AGENCY:
    - TABOOST repos --> 01_ACTIVE_PROJECTS\AGENCY\TABOOST\
    - Creator CSVs --> 01_ACTIVE_PROJECTS\AGENCY\clients\
  
  DEV/TOOLS:
    - molly repo --> 01_ACTIVE_PROJECTS\DEV\molly\
    - Scripts --> 01_ACTIVE_PROJECTS\DEV\tools\

STEP 3: Organize Downloads (AUTO)
  Run: python typea_organize.py --execute
  This sorts Downloads by file type and domain

STEP 4: Clean Desktop (AUTO)
  Run: python typea_organize.py --sources ~/Desktop --execute
  Moves desktop clutter to proper folders

STEP 5: Archive old stuff
  Anything > 6 months old --> 03_ARCHIVE\YYYY\

DAILY WORKFLOW:
  1. New files --> Drop in 00_INBOX
  2. Process inbox --> Sort to proper domain
  3. Active work --> Keep in 01_ACTIVE_PROJECTS
  4. Complete --> Move to 03_ARCHIVE
  5. Trash --> 99_TEMP (auto-delete weekly)

WEEKLY MAINTENANCE:
  - Empty 99_TEMP
  - Archive completed projects
  - Review 00_INBOX
"""
    
    return plan

def main():
    print("TYPE A FOLDER ORGANIZATION SYSTEM")
    print("=" * 70)
    
    # Analyze current state
    file_count = analyze_current_state()
    
    # Create new structure
    base = Path.home() / 'organized_life'
    create_typea_structure(base)
    
    # Save migration plan
    plan = generate_migration_plan()
    plan_file = base / '_MIGRATION_PLAN.txt'
    with open(plan_file, 'w', encoding='utf-8') as f:
        f.write(plan)
    
    print(f"\nMigration plan saved: {plan_file}")
    
    print("\n" + "=" * 70)
    print("NEXT STEPS:")
    print("=" * 70)
    print("1. Review migration plan above")
    print("2. Run dry-run: python typea_organize.py")
    print("3. Execute: python typea_organize.py --execute")
    print("4. Pin organized_life folder to Quick Access")
    print("\nYour new structure is ready at:")
    print(f"  {base}")
    
    # Open folder
    os.startfile(base)

if __name__ == '__main__':
    main()
