#!/usr/bin/env bash
# Install / uninstall the dsh-peak-hours plugin into a DeepSeek Harness profile.
#
# Usage:
#   bash ./install-macos.sh                 # install into ~/.dsh/profiles/desktop
#   PROFILE=web bash ./install-macos.sh     # install into another profile
#   bash ./install-macos.sh --uninstall
#
# Works on macOS and Linux; no root required.

set -euo pipefail

PLUGIN_NAME="dsh-peak-hours"
MARKER_START="# >>> dsh-peak-hours >>>"
MARKER_END="# <<< dsh-peak-hours <<<"
PROFILE="${PROFILE:-desktop}"

UNINSTALL=0
case "${1:-}" in
  --uninstall|-u) UNINSTALL=1 ;;
  --profile) PROFILE="${2:?missing profile name}" ;;
esac

SRC_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
DEST_DIR="$PROFILE_DIR/node_modules/$PLUGIN_NAME"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "Profile not found: $PROFILE_DIR" >&2
  echo "Set PROFILE=<name> or check DSH_HOME. The desktop app uses 'desktop'." >&2
  exit 1
fi

remove_block() {
  awk -v start="$MARKER_START" -v end="$MARKER_END" '
    $0 == start { skip = 1 }
    !skip { print }
    $0 == end { skip = 0 }
  ' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}

if [ "$UNINSTALL" -eq 1 ]; then
  if [ -d "$DEST_DIR" ]; then
    rm -rf "$DEST_DIR"
    echo "Removed $DEST_DIR"
  fi
  if [ -f "$PATCH_FILE" ] && grep -qF "$MARKER_START" "$PATCH_FILE"; then
    remove_block "$PATCH_FILE"
    echo "Removed the $PLUGIN_NAME block from cordis.patch.yml"
  fi
  echo
  echo "Done. Restart DeepSeek Harness to finish unloading."
  exit 0
fi

if [ "$SRC_DIR" = "$(cd -- "$DEST_DIR" 2>/dev/null && pwd || echo '')" ]; then
  echo "Source and destination are the same folder; run this from the plugin folder." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR/node_modules"
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"
cp -R "$SRC_DIR/." "$DEST_DIR/"
echo "Copied plugin to $DEST_DIR"

if [ ! -f "$PATCH_FILE" ]; then
  printf '[]\n' > "$PATCH_FILE"
fi

if grep -qF "$PLUGIN_NAME" "$PATCH_FILE"; then
  echo "cordis.patch.yml already mentions $PLUGIN_NAME - leaving it untouched."
else
  {
    printf '\n%s\n' "$MARKER_START"
    printf '%s\n' '- insert:'
    printf '%s\n' '    - id: dsh-peak-hours'
    printf '%s\n' '      name: dsh-peak-hours'
    printf '%s\n' "$MARKER_END"
  } >> "$PATCH_FILE"
  echo "Added the $PLUGIN_NAME row to $PATCH_FILE"
fi

echo
echo "Installed. Restart DeepSeek Harness (quit fully, then relaunch)."
