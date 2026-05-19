#!/usr/bin/env bash
set -euo pipefail

# mml2tex.sh - Linux-compatible wrapper to run Saxon transform for MathML->TeX
# Usage: mml2tex.sh <input.mml> <output.tex>

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$REPO_ROOT/calabash/distro/lib"
SAXON_JAR="$LIB_DIR/Saxon-HE-10.8.jar"
CLASSPATH="$SAXON_JAR:$LIB_DIR/*"

MML_FILE="${1:-}"
OUT_FILE="${2:-}"

if [ -z "$MML_FILE" ]; then
  echo "Usage: $(basename "$0") <input.mml> <output.tex>" >&2
  exit 1
fi

if [ -z "$OUT_FILE" ]; then
  echo "Output file not specified." >&2
  exit 1
fi

if [ ! -f "$SAXON_JAR" ]; then
  echo "Warning: Saxon jar not found at $SAXON_JAR" >&2
fi

exec java -Xmx512m -cp "$CLASSPATH" net.sf.saxon.Transform \
  -s:"$MML_FILE" \
  -xsl:"$REPO_ROOT/mml2tex/xsl/invoke-mml2tex.xsl" \
  -o:"$OUT_FILE"
