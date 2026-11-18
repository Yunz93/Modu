#!/bin/bash
set -euo pipefail

readonly releases="https://github.com/Yunz93/Modu/releases"
readonly bundle_id="com.yunz.modu"
readonly app_name="墨牍.app"
download_dir=""
mount_point=""
staging=""
install_lock=""
destination=""
installed=0

die() { printf '安装失败：%s\n' "$*" >&2; exit 1; }

cleanup() {
  local status=$?
  local previous
  if [[ -n "$staging" ]]; then
    previous="$staging/previous.app"
    if [[ "$installed" = 0 && -d "$previous" ]]; then
      if [[ ! -e "$destination" && ! -L "$destination" ]] &&
         /bin/mv -h "$previous" "$destination"; then
        printf '已恢复原应用。\n' >&2
      else
        printf '原应用保留在 %s，可手动恢复。\n' "$previous" >&2
        staging=""
      fi
    fi
    [[ -z "$staging" ]] || /bin/rm -rf "$staging" || true
  fi
  [[ -z "$install_lock" ]] || /bin/rmdir "$install_lock" || true
  if [[ -n "$mount_point" ]] && ! /usr/bin/hdiutil detach "$mount_point" -quiet; then
    printf '请在访达推出安装镜像，临时文件位于 %s。\n' "$download_dir" >&2
  elif [[ -n "$download_dir" ]]; then
    /bin/rm -rf "$download_dir" || true
  fi
  return "$status"
}

fetch() {
  /usr/bin/curl --fail --silent --show-error --location \
    --proto '=https' --proto-redir '=https' --connect-timeout 15 \
    --max-time 300 "$@"
}

resolve_tag() {
  local requested="${RELEASE_TAG:-}" url
  if [[ -z "$requested" ]]; then
    url="$(fetch --output /dev/null --write-out '%{url_effective}' "$releases/latest")" || return 1
    [[ "$url" = "$releases/tag/"* ]] || return 1
    requested="${url#"$releases/tag/"}"
  fi
  [[ "$requested" = v* ]] || requested="v$requested"
  [[ "$requested" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || return 1
  printf '%s\n' "$requested"
}

plist() {
  /usr/libexec/PlistBuddy -c "Print:$2" "$1/Contents/Info.plist"
}

check_destination() {
  local processes process
  if [[ -e "$destination" || -L "$destination" ]]; then
    [[ -d "$destination" && ! -L "$destination" &&
       "$(plist "$destination" CFBundleIdentifier 2>/dev/null)" = "$bundle_id" ]] ||
      die "目标位置已有其他文件或应用：$destination"
  fi
  processes="$(/bin/ps -axww -o comm=)" || die "无法确认墨牍是否已退出。"
  while IFS= read -r process; do
    if [[ "$process" = "$destination/Contents/MacOS/modu" ]] ||
       [[ "${OPEN_APP:-1}" != 0 && ( "${process##*/}" = modu || "${process##*/}" = shidu ) ]]; then
      die "请先用 ⌘Q 退出正在运行的墨牍或拾读，再重新安装。"
    fi
  done <<< "$processes"
}

main() {
  local tag version asset base checksum actual dir source candidate
  [[ "$(/usr/bin/uname -s)" = Darwin ]] || die "此脚本仅支持 macOS。"
  [[ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]] ||
    die "当前 Release 只提供 Apple Silicon 安装包。"
  tag="$(resolve_tag)" || die "找不到正式版。请检查网络，或将 RELEASE_TAG 设为 vX.Y.Z。"
  version="${tag#v}"
  asset="Modu_${version}_aarch64.dmg"
  base="$releases/download/$tag"
  dir="${INSTALL_DIR:-/Applications}"
  /bin/mkdir -p -- "$dir" || die "无法创建安装目录：$dir"
  dir="$(cd -- "$dir" && pwd -P)"
  destination="$dir/$app_name"
  check_destination
  staging="$(/usr/bin/mktemp -d "$dir/.modu-install.XXXXXX")" ||
    die '无法写入安装目录。可设定 INSTALL_DIR="$HOME/Applications"。'
  download_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/modu-download.XXXXXX")"

  printf '正在下载墨牍 %s…\n' "$tag"
  fetch --output "$download_dir/SHA256SUMS.txt" "$base/SHA256SUMS.txt" || die "下载校验清单失败。"
  checksum="$(/usr/bin/awk -v asset="$asset" 'NF == 2 && $2 == asset { print $1 }' "$download_dir/SHA256SUMS.txt")"
  [[ "$checksum" =~ ^[0-9a-f]{64}$ ]] || die "校验清单缺少唯一有效的 DMG 摘要。"
  fetch --output "$download_dir/$asset" "$base/$asset" || die "下载 DMG 失败。"
  actual="$(/usr/bin/shasum -a 256 < "$download_dir/$asset")"
  [[ "${actual%% *}" = "$checksum" ]] || die "DMG 的 SHA-256 校验失败。"

  /usr/bin/hdiutil verify "$download_dir/$asset" -quiet || die "DMG 镜像校验失败。"
  /bin/mkdir "$download_dir/mount"
  /usr/bin/hdiutil attach "$download_dir/$asset" -readonly -nobrowse -noautoopen \
    -mountpoint "$download_dir/mount" -quiet || die "无法挂载安装镜像。"
  mount_point="$download_dir/mount"
  source="$mount_point/$app_name"
  candidate="$staging/new.app"
  [[ -d "$source" && ! -L "$source" ]] || die "镜像内未找到墨牍。"
  /usr/bin/ditto "$source" "$candidate" || die "复制应用失败。"
  [[ "$(plist "$candidate" CFBundleIdentifier)" = "$bundle_id" &&
     "$(plist "$candidate" CFBundleShortVersionString)" = "$version" &&
     "$(plist "$candidate" CFBundleExecutable)" = modu &&
     -x "$candidate/Contents/MacOS/modu" ]] || die "应用标识、版本或入口不匹配。"
  [[ "$(/usr/bin/file -b "$candidate/Contents/MacOS/modu")" = *arm64* ]] ||
    die "应用不包含 Apple Silicon 可执行文件。"
  /usr/bin/codesign --verify --deep --strict "$candidate" || die "应用代码签名校验失败。"

  /bin/mkdir "$dir/.modu-install.lock" 2>/dev/null ||
    die "已有另一个安装任务正在替换应用，请稍后重试。"
  install_lock="$dir/.modu-install.lock"
  check_destination
  if [[ -d "$destination" ]]; then
    /bin/mv -h "$destination" "$staging/previous.app" || die "无法暂存原应用。"
  fi
  /bin/mv -h "$candidate" "$destination" || die "无法替换应用。"
  installed=1
  printf '墨牍 %s 已安装到 %s\n' "$version" "$destination"
  if [[ "${OPEN_APP:-1}" != 0 ]]; then
    /usr/bin/open -a "$destination" || printf '安装已完成，请从应用程序目录打开墨牍。\n' >&2
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
main "$@"
