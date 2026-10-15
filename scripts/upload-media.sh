#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <rclone-r2-remote:bucket>" >&2
  echo "Example: $0 r2:velox-world-media" >&2
  exit 64
fi

destination=${1%/}
project_root=$(cd "$(dirname "$0")/.." && pwd)

upload_tree() {
  local source_path=$1
  local object_prefix=$2
  rclone copy "$project_root/$source_path" "$destination/$object_prefix" \
    --progress \
    --checksum \
    --transfers 8 \
    --checkers 16 \
    --header-upload "Cache-Control: public, max-age=31536000, immutable"
}

upload_tree "assets/img" "assets/img"
upload_tree "assets/media" "assets/media"
upload_tree "velox/figures" "velox/figures"
upload_tree "velox/videos" "velox/videos"
upload_tree "rpo/sd3.5/base" "rpo/sd3.5/base"
upload_tree "rpo/sd3.5/rpo" "rpo/sd3.5/rpo"
upload_tree "rpo/wan2.2/posters-v629s50" "rpo/wan2.2/posters-v629s50"
upload_tree "rpo/wan2.2/side-by-side-v629s50" "rpo/wan2.2/side-by-side-v629s50"

echo "Media upload complete: $destination"
