#!/usr/bin/env python3
"""Clear all rows from sqlite tables except protected tables."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

PROTECTED_TABLES = {"user", "prompt"}


def get_tables(conn: sqlite3.Connection) -> list[str]:
    """Return all user-defined table names in the sqlite database."""
    cursor = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    )
    return [row[0] for row in cursor.fetchall()]


def clear_tables(db_path: Path) -> None:
    """Delete all rows from non-protected tables."""
    if not db_path.exists():
        raise FileNotFoundError(f"数据库文件不存在: {db_path}")

    with sqlite3.connect(db_path) as conn:
        tables = get_tables(conn)
        target_tables = [t for t in tables if t not in PROTECTED_TABLES]

        if not target_tables:
            print("没有可清空的表（除 user 和 prompt 外）。")
            return

        # Temporarily disable FK checks to avoid delete-order constraints.
        conn.execute("PRAGMA foreign_keys = OFF;")
        try:
            with conn:
                for table in target_tables:
                    conn.execute(f'DELETE FROM "{table}";')
            print("已清空以下表的数据：")
            for table in target_tables:
                print(f"- {table}")
        finally:
            conn.execute("PRAGMA foreign_keys = ON;")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="清空 sqlite3 数据库中除 user 和 prompt 之外所有表的数据。"
    )
    parser.add_argument("db_path", type=Path, help="目标 sqlite3 数据库文件路径（.db）")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    clear_tables(args.db_path)


if __name__ == "__main__":
    main()
