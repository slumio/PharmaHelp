import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('manage', Path(__file__).resolve().parents[1] / 'manage.py')
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class ManagementTests(unittest.TestCase):
    def test_init_creates_private_credentials_and_preserves_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(manage, 'ROOT', root), patch('os.chdir'), patch('sys.argv', ['manage.py', 'init']):
                manage.main()
                original = (root / '.env').read_text()
                self.assertIn('APP_PASSWORD=', original)
                self.assertEqual((root / '.env').stat().st_mode & 0o777, 0o600)
                with self.assertRaises(SystemExit):
                    manage.main()
                self.assertEqual((root / '.env').read_text(), original)

    def test_up_does_not_seed(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(manage, 'ROOT', Path(directory)), patch('os.chdir'), patch('sys.argv', ['manage.py', 'up']), patch.object(manage, 'run') as run:
                manage.main()
                run.assert_called_once_with('docker', 'compose', 'up', '--build', '-d', '--wait', 'app')
