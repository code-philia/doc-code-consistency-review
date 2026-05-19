#!/usr/bin/env bash
set -euo pipefail

# Get absolute path of this script
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILE_INPUT="${1:-}"
OUT_DIR_PARAM="${3:-}"

if [ -z "$FILE_INPUT" ]; then
    echo "Usage: $0 <input.docx> <unused> [output_dir]"
    exit 1
fi

# 默认使用项目根目录下的 output_workspace
if [ -z "$OUT_DIR_PARAM" ]; then
    OUT_DIR="$REPO_ROOT/output_workspace"
else
    OUT_DIR="$(realpath -m "$OUT_DIR_PARAM")"
fi

mkdir -p "$OUT_DIR"

BASENAME="$(basename "$FILE_INPUT")"
BASENAME_NOEXT="${BASENAME%.*}"

# 在 output_workspace 下创建带有随机后缀的临时目录，确保每次运行独立
TMPDIR="$OUT_DIR/${BASENAME_NOEXT}_temp_$RANDOM"
mkdir -p "$TMPDIR"

LOG="$TMPDIR/run.log"
cp -f -- "$FILE_INPUT" "$TMPDIR/$BASENAME"
FILE="$TMPDIR/$BASENAME"

# 转换路径为 URI
_to_uri() { python3 -c "import sys, pathlib; print(pathlib.Path(sys.argv[1]).resolve().as_uri())" "$1"; }

FILE_URI="$(_to_uri "$FILE")"
CONF_URI="$(_to_uri "$REPO_ROOT/conf/conf.xml")"
FONTMAPS="$(_to_uri "$REPO_ROOT/fontmaps")/"
CALABASH="$REPO_ROOT/calabash/calabash.sh"

echo "Processing $BASENAME_NOEXT in $TMPDIR..."

set +e
# 将 Hub XML 生成到这个特定的临时文件夹内
# 这样 py 脚本的 rglob(f"{stem}.xml") 就能在这些子文件夹里找到它
(cd "$REPO_ROOT" && "$CALABASH" -o hub="$TMPDIR/${BASENAME_NOEXT}.xml" "$REPO_ROOT/xpl/docx2tex.xpl" docx="$FILE_URI" conf="$CONF_URI" custom-font-maps-dir="$FONTMAPS" debug=yes > "$LOG" 2>&1)
RC=$?
set -e

if [ $RC -eq 0 ] && [ -f "$TMPDIR/${BASENAME_NOEXT}.xml" ]; then
    echo "Conversion finished. XML output: $TMPDIR/${BASENAME_NOEXT}.xml"
else
    echo "Conversion failed. Check log: $LOG" >&2
    exit 1
fi
