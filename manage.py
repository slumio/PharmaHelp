#!/usr/bin/env python3
"""Dependency-free Python 3.10+ operations CLI for PharmaHelp."""
import argparse
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['init', 'up', 'down', 'logs', 'status', 'dev', 'build', 'start', 'setup-db', 'test', 'backup'])
    parser.add_argument('--output', type=Path, help='Backup destination (must not exist)')
    args = parser.parse_args()
    os.chdir(ROOT)
    # Read simple KEY=value configuration without executing shell content.
    env_file = ROOT / '.env'
    if env_file.exists():
        for line in env_file.read_text(encoding='utf-8').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip())
    if args.command == 'init':
        target = ROOT / '.env'
        if target.exists():
            parser.error('.env already exists; it was preserved')
        password = secrets.token_urlsafe(24)
        with target.open('x', encoding='utf-8') as file:
            os.chmod(target, 0o600)
            file.write(f'MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true\nMONGODB_DB=pharmahelp\nSTORE_ID=1\nAPP_USERNAME=admin\nAPP_PASSWORD={password}\nAPP_ORIGIN=http://localhost:3000\nPORT=3000\nOPENAI_API_KEY=\n')
        print('Created .env with random credentials. Read APP_PASSWORD there to sign in.')
    elif args.command == 'up':
        run('docker', 'compose', 'up', '--build', '-d', '--wait', 'app')
    elif args.command in ('down', 'logs', 'status'):
        commands = {'down': ['down'], 'logs': ['logs', '--follow', '--tail', '100'], 'status': ['ps']}
        run('docker', 'compose', *commands[args.command])
    elif args.command == 'backup':
        if not args.output:
            parser.error('backup requires --output PATH')
        with args.output.open('xb') as output:
            subprocess.run(['docker', 'compose', 'exec', '-T', 'mongo', 'mongodump', '--db', os.environ.get('MONGODB_DB', 'pharmahelp'), '--archive', '--gzip'], stdout=output, check=True)
        print(f'Backup saved to {args.output}')
    else:
        commands = {'dev': 'dev', 'build': 'build', 'start': 'start', 'setup-db': 'db:setup', 'test': 'test'}
        run('npm', 'run', commands[args.command])


if __name__ == '__main__':
    try:
        main()
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f'Command failed: {exc}', file=sys.stderr)
        sys.exit(1)
