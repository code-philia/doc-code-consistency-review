#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ModuleNotFoundError:
    pymysql = None
    DictCursor = None


REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_FILE = REPO_ROOT / "schema.sql"

DEFAULT_DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "123456",
    "database": "doc_code",
    "charset": "utf8mb4",
    "cursorclass": DictCursor,
}


@dataclass(frozen=True)
class ColumnSpec:
    name: str
    definition: str
    after: str | None = None


@dataclass(frozen=True)
class IndexSpec:
    name: str
    columns: tuple[str, ...]
    unique: bool = False


TABLE_COLUMNS: dict[str, list[ColumnSpec]] = {
    "alignments": [
        ColumnSpec("is_code_review", "`is_code_review` tinyint(1) DEFAULT '0'", after="GenMermaid"),
        ColumnSpec("align_type", "`align_type` varchar(100) DEFAULT NULL COMMENT '对齐类型: 需求->代码，代码->需求'", after="is_code_review"),
        ColumnSpec("is_alignment", "`is_alignment` tinyint(1) DEFAULT '0' COMMENT '是否对齐：0未对齐，1已对齐'", after="align_type"),
    ],
    "code_blocks": [
        ColumnSpec("name", "`name` varchar(255) DEFAULT NULL COMMENT '代码块名称'", after="id"),
        ColumnSpec("related_id", "`related_id` json DEFAULT NULL COMMENT '关联代码块id列表'", after="code"),
        ColumnSpec("related_range", "`related_range` json DEFAULT NULL COMMENT '关联范围映射'", after="related_id"),
    ],
    "doc_blocks": [
        ColumnSpec("name", "`name` varchar(255) DEFAULT NULL COMMENT '需求块名称'", after="id"),
    ],
    "project": [
        ColumnSpec("create_time", "`create_time` varchar(100) DEFAULT NULL COMMENT '创建时间'", after="path"),
        ColumnSpec("update_time", "`update_time` varchar(100) DEFAULT NULL COMMENT '更新时间'", after="create_time"),
        ColumnSpec("is_delete", "`is_delete` int DEFAULT '0' COMMENT '是否删除'", after="update_time"),
        ColumnSpec("project_secret_level", "`project_secret_level` varchar(100) DEFAULT NULL COMMENT '密级'", after="is_delete"),
    ],
    "prompt": [
        ColumnSpec("reviewCode", "`reviewCode` text COMMENT '代码单独审查提示词'", after="reviewKbs"),
        ColumnSpec("reviewCodeKbs", "`reviewCodeKbs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '代码单独审查-知识库版'", after="reviewCode"),
    ],
}

TABLE_MODIFY_COLUMNS: dict[str, list[str]] = {
    "alignments": [
        "MODIFY COLUMN `codeRanges` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '代码'",
    ],
    "code_blocks": [
        "MODIFY COLUMN `code` mediumtext COMMENT '代码块内容'",
    ],
    "doc_blocks": [
        "MODIFY COLUMN `content` mediumtext COMMENT '需求块内容'",
    ],
}

TABLE_INDEXES: dict[str, list[IndexSpec]] = {
    "code_blocks": [
        IndexSpec("code_block_unique", ("project_id", "id"), unique=True),
        IndexSpec("idx_code_blocks_project_file", ("project_id", "file")),
    ],
    "doc_blocks": [
        IndexSpec("doc_block_unique", ("project_id", "id"), unique=True),
        IndexSpec("idx_doc_blocks_project_file", ("project_id", "filename")),
    ],
    "export_tasks": [
        IndexSpec("export_tasks_unique", ("task_id",), unique=True),
    ],
    "prompt": [
        IndexSpec("prompt_unique", ("user_id",), unique=True),
    ],
}

JSON_COLUMNS = {
    ("code_blocks", "related_id", "关联代码块id列表"),
    ("code_blocks", "related_range", "关联范围映射"),
}


class MigrationRunner:
    def __init__(self, connection, *, dry_run: bool = False, verbose: bool = True):
        self.connection = connection
        self.dry_run = dry_run
        self.verbose = verbose

    def log(self, message: str) -> None:
        if self.verbose:
            print(message)

    @staticmethod
    def _normalize_row(row, description) -> dict | None:
        if row is None:
            return None
        if isinstance(row, dict):
            return {str(key).lower(): value for key, value in row.items()}
        if isinstance(row, (tuple, list)):
            columns = [str(col[0]).lower() for col in (description or [])]
            return {name: value for name, value in zip(columns, row)}
        return {"value": row}

    def execute(self, sql: str, params: tuple | None = None) -> None:
        if self.dry_run:
            self.log(f"[dry-run] {sql}")
            if params:
                self.log(f"          params={params}")
            return
        self.log(sql)
        with self.connection.cursor() as cur:
            cur.execute(sql, params or ())

    def query_one(self, sql: str, params: tuple | None = None) -> dict | None:
        with self.connection.cursor() as cur:
            cur.execute(sql, params or ())
            return self._normalize_row(cur.fetchone(), cur.description)

    def query_all(self, sql: str, params: tuple | None = None) -> list[dict]:
        with self.connection.cursor() as cur:
            cur.execute(sql, params or ())
            return [self._normalize_row(row, cur.description) for row in cur.fetchall()]


def load_create_table_statements(schema_path: Path) -> dict[str, str]:
    text = schema_path.read_text(encoding="utf-8")
    pattern = re.compile(r"CREATE TABLE `(?P<name>[^`]+)` \((?P<body>.*?)\) ENGINE=.*?;", re.S)
    statements: dict[str, str] = {}
    for match in pattern.finditer(text):
        statements[match.group("name")] = match.group(0)
    return statements


def table_exists(runner: MigrationRunner, table_name: str) -> bool:
    row = runner.query_one(
        """
        SELECT COUNT(*) AS total
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
        """,
        (table_name,),
    )
    return bool(row and int(row.get("total") or 0) > 0)


def get_columns(runner: MigrationRunner, table_name: str) -> dict[str, dict]:
    rows = runner.query_all(
        """
        SELECT column_name, column_type, data_type, is_nullable, column_default, column_comment
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table_name,),
    )
    return {str(row["column_name"]): row for row in rows}


def get_indexes(runner: MigrationRunner, table_name: str) -> dict[str, dict]:
    rows = runner.query_all(
        """
        SELECT index_name, non_unique, seq_in_index, column_name
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = %s
        ORDER BY index_name, seq_in_index
        """,
        (table_name,),
    )
    grouped: dict[str, dict] = {}
    for row in rows:
        name = str(row["index_name"])
        info = grouped.setdefault(name, {"unique": int(row["non_unique"]) == 0, "columns": []})
        info["columns"].append(str(row["column_name"]))
    return grouped


def add_missing_column(runner: MigrationRunner, table_name: str, column: ColumnSpec, existing_columns: dict[str, dict]) -> None:
    if column.name in existing_columns:
        return
    after_clause = f" AFTER `{column.after}`" if column.after and column.after in existing_columns else ""
    runner.execute(f"ALTER TABLE `{table_name}` ADD COLUMN {column.definition}{after_clause}")


def invalid_json_row_count(runner: MigrationRunner, table_name: str, column_name: str) -> int:
    row = runner.query_one(
        f"""
        SELECT COUNT(*) AS total
        FROM `{table_name}`
        WHERE `{column_name}` IS NOT NULL
          AND JSON_VALID(`{column_name}`) = 0
        """
    )
    return int((row or {}).get("total") or 0)


def modify_existing_columns(runner: MigrationRunner, table_name: str, columns: dict[str, dict]) -> None:
    for statement in TABLE_MODIFY_COLUMNS.get(table_name, []):
        runner.execute(f"ALTER TABLE `{table_name}` {statement}")

    for json_table, json_column, comment in JSON_COLUMNS:
        if json_table != table_name:
            continue
        column_meta = columns.get(json_column)
        if not column_meta:
            continue
        if str(column_meta.get("data_type") or "").lower() == "json":
            continue
        invalid_count = invalid_json_row_count(runner, table_name, json_column)
        if invalid_count > 0:
            runner.log(
                f"[warn] skip JSON conversion for `{table_name}`.`{json_column}`: "
                f"{invalid_count} rows contain invalid JSON."
            )
            continue
        runner.execute(
            f"ALTER TABLE `{table_name}` MODIFY COLUMN `{json_column}` json DEFAULT NULL COMMENT '{comment}'"
        )


def duplicate_count_for_index(runner: MigrationRunner, table_name: str, columns: Iterable[str]) -> int:
    cols = [f"`{name}`" for name in columns]
    null_predicate = " OR ".join(f"`{name}` IS NULL" for name in columns)
    group_cols = ", ".join(cols)
    row = runner.query_one(
        f"""
        SELECT COUNT(*) AS total
        FROM (
            SELECT {group_cols}, COUNT(*) AS cnt
            FROM `{table_name}`
            WHERE NOT ({null_predicate})
            GROUP BY {group_cols}
            HAVING COUNT(*) > 1
        ) AS duplicate_rows
        """
    )
    return int((row or {}).get("total") or 0)


def ensure_indexes(runner: MigrationRunner, table_name: str) -> None:
    existing = get_indexes(runner, table_name)
    for spec in TABLE_INDEXES.get(table_name, []):
        current = existing.get(spec.name)
        if current:
            if tuple(current["columns"]) == spec.columns and bool(current["unique"]) == spec.unique:
                continue
        if spec.unique:
            duplicates = duplicate_count_for_index(runner, table_name, spec.columns)
            if duplicates > 0:
                runner.log(
                    f"[warn] skip unique index `{spec.name}` on `{table_name}`: "
                    f"found {duplicates} duplicate key groups in existing data."
                )
                continue
            prefix = "ADD UNIQUE KEY"
        else:
            prefix = "ADD KEY"
        columns_sql = ", ".join(f"`{name}`" for name in spec.columns)
        runner.execute(f"ALTER TABLE `{table_name}` {prefix} `{spec.name}` ({columns_sql})")


def ensure_tables_from_schema(runner: MigrationRunner, create_sql_by_table: dict[str, str]) -> None:
    for table_name, create_sql in create_sql_by_table.items():
        if table_exists(runner, table_name):
            continue
        runner.execute(create_sql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1))


def migrate_existing_tables(runner: MigrationRunner) -> None:
    for table_name, specs in TABLE_COLUMNS.items():
        if not table_exists(runner, table_name):
            continue
        columns = get_columns(runner, table_name)
        for spec in specs:
            add_missing_column(runner, table_name, spec, columns)
            if spec.name not in columns:
                columns[spec.name] = {"data_type": spec.definition}
        modify_existing_columns(runner, table_name, get_columns(runner, table_name))
        ensure_indexes(runner, table_name)

    for table_name in set(TABLE_INDEXES) - set(TABLE_COLUMNS):
        if table_exists(runner, table_name):
            ensure_indexes(runner, table_name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="迁移 MySQL 表结构到当前 schema.sql，尽量不影响已有数据。")
    parser.add_argument("--host", default=DEFAULT_DB_CONFIG["host"])
    parser.add_argument("--port", type=int, default=int(DEFAULT_DB_CONFIG["port"]))
    parser.add_argument("--user", default=DEFAULT_DB_CONFIG["user"])
    parser.add_argument("--password", default=DEFAULT_DB_CONFIG["password"])
    parser.add_argument("--database", default=DEFAULT_DB_CONFIG["database"])
    parser.add_argument("--dry-run", action="store_true", help="只打印将执行的 SQL，不真正执行")
    parser.add_argument("--quiet", action="store_true", help="减少输出")
    return parser.parse_args()


def main() -> None:
    if pymysql is None:
        raise SystemExit("missing dependency: pymysql")

    args = parse_args()
    create_sql_by_table = load_create_table_statements(SCHEMA_FILE)
    connect_kwargs = {
        "host": args.host,
        "port": args.port,
        "user": args.user,
        "password": args.password,
        "database": args.database,
        "charset": DEFAULT_DB_CONFIG["charset"],
        "autocommit": False,
    }
    if DEFAULT_DB_CONFIG["cursorclass"] is not None:
        connect_kwargs["cursorclass"] = DEFAULT_DB_CONFIG["cursorclass"]
    connection = pymysql.connect(**connect_kwargs)
    try:
        runner = MigrationRunner(connection, dry_run=args.dry_run, verbose=not args.quiet)
        ensure_tables_from_schema(runner, create_sql_by_table)
        migrate_existing_tables(runner)
        if args.dry_run:
            print("dry-run complete")
        else:
            connection.commit()
            print("migration complete")
    except Exception:
        if not args.dry_run:
            connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
