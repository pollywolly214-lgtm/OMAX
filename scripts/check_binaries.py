#!/usr/bin/env python3
"""Fail if any tracked file looks binary.

A file is treated as binary when it contains a NUL byte or cannot be
UTF-8-decoded. Git-managed files inside .git are ignored by `git
ls-files`, so this scan covers only the working tree.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    try:
        tracked = subprocess.check_output(
            ["git", "ls-files"], cwd=repo, text=True
        ).splitlines()
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(f"Failed to list tracked files: {exc}\n")
        return 1

    binary_paths: list[str] = []
    for rel in tracked:
        path = repo / rel
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b"\0" in data:
            binary_paths.append(rel)
            continue
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            binary_paths.append(rel)

    if binary_paths:
        sys.stderr.write("Binary files detected; please replace with text-based formats:\n")
        for rel in binary_paths:
            sys.stderr.write(f" - {rel}\n")
        return 1

    print("No binary tracked files found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
