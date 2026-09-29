import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import server


class TraceViewStartupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / "startup.json"
        self.viewer = self.root / "trace viewer 中文"
        self.viewer.mkdir()
        (self.viewer / "server.py").write_text("", encoding="utf-8")
        self.here = patch.object(server, "HERE", str(self.root))
        self.here.start()
        self.addCleanup(self.here.stop)

    def run_startup(self, config):
        self.config.write_text(json.dumps(config), encoding="utf-8-sig")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            server.start_optional_trace_view("startup.json")

    @patch.object(server.subprocess, "Popen")
    def test_missing_or_disabled_config_does_not_launch(self, popen):
        server.start_optional_trace_view("missing.json")
        for config in ({}, {"trace_view": None}, {"trace_view": {}},
                       {"trace_view": {"enabled": False, "path": "missing"}}):
            with self.subTest(config=config):
                self.run_startup(config)
        popen.assert_not_called()

    @patch.object(server.subprocess, "Popen")
    def test_bad_config_does_not_escape_or_launch(self, popen):
        good = {"enabled": True, "path": str(self.viewer)}
        configs = [[], {"trace_view": "bad"}]
        for changes in ({"enabled": "true"}, {"path": "missing"}, {"path": None},
                        {"port": "8912"}, {"port": True}, {"port": 0},
                        {"port": 65536}, {"host": []}, {"host": ""}):
            configs.append({"trace_view": {**good, **changes}})
        for config in configs:
            with self.subTest(config=config):
                self.run_startup(config)
        for raw in (b"{broken", b"\xff\xfe"):
            self.config.write_bytes(raw)
            with contextlib.redirect_stderr(io.StringIO()):
                server.start_optional_trace_view(str(self.config))
        popen.assert_not_called()

    @patch.object(server.subprocess, "Popen")
    def test_launch_uses_config_relative_path_and_shared_trace_directory(self, popen):
        with patch.object(server.Handler, "trace_dir", str(self.root / "traces")):
            self.run_startup({"trace_view": {"enabled": True, "path": self.viewer.name}})
        args, kwargs = popen.call_args
        self.assertEqual(args[0], [server.sys.executable, "-u", str(self.viewer / "server.py"),
                                  "--host", "127.0.0.1", "--port", "8912",
                                  "--trace-dir", str(self.root / "traces")])
        self.assertEqual(kwargs["cwd"], str(self.viewer))
        self.assertEqual(kwargs["stdin"], server.subprocess.DEVNULL)
        if os.name == "nt":
            self.assertEqual(kwargs["creationflags"], server.subprocess.CREATE_NO_WINDOW)
        self.assertTrue((self.root / "logs" / "trace_view.log").is_file())

    @patch.object(server.subprocess, "Popen", side_effect=OSError("cannot launch"))
    def test_process_failure_is_nonfatal(self, popen):
        self.run_startup({"trace_view": {"enabled": True, "path": str(self.viewer)}})
        popen.assert_called_once()

    @patch.object(server.subprocess, "Popen")
    def test_log_failure_is_nonfatal(self, popen):
        (self.root / "logs").write_text("not a directory", encoding="utf-8")
        self.run_startup({"trace_view": {"enabled": True, "path": str(self.viewer)}})
        popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
