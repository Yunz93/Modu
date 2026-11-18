# 墨牍 Modu

面向 macOS 的本地 RSS 阅读器。集中订阅博客与技术资讯，留一点时间，读点好内容。

## 功能

- RSS / Atom 订阅、网页订阅发现、手动刷新与 SQLite 离线缓存。
- 经典三栏、未读与收藏、来源筛选、标题/摘要搜索、专注阅读与键盘快捷键。
- 墨知金属灰与纸质白、自定义主题色、系统字体发现、界面和正文字体独立设置。
- 阅读位置、已读、收藏与外观自动保存，退出后继续阅读。
- RSS / Atom / OPML 导入、OPML 导出、完整 JSON 备份与恢复前自动备份。
- 应用内更新：静默检查、跳过版本、进度、取消下载、签名验证与安装重启。安装前保存失败会停止更新。
- 原拾读阅读库自动迁移，旧库保持原样。
- 订阅读取可取消，刷新错误保留并可重试，取消订阅后可恢复缓存。
- 保存失败可继续使用、重试或导出后退出；损坏阅读库支持保留原文件后从备份恢复。
- 原生菜单、单实例与窗口位置/逻辑尺寸记忆。

桌面窗口负责真实联网订阅。保留浏览器预览，使用 localStorage 与文件导入，不提供浏览器内原生更新。远程图片、全文提取、云同步、AI 和后台订阅轮询不在当前范围。

## 下载

从 [墨牍 0.1.1](https://github.com/Yunz93/Modu/releases/tag/v0.1.1) 下载 Apple Silicon DMG，将「墨牍.app」拖入 Applications。当前安装包使用 ad-hoc 签名，未做 Apple 公证。

拾读 0.1.0 需要手动安装一次墨牍。首次启动墨牍前先退出拾读，墨牍会自动复制旧阅读库。之后可在阅读库菜单中检查更新。

## macOS 一键安装

在 Apple Silicon Mac 的终端运行以下命令。脚本从 GitHub Releases 下载最新正式版，校验安装包后安装到 `/Applications/墨牍.app` 并打开。使用中的墨牍或拾读请先用 ⌘Q 退出。

```sh
(set -o pipefail; curl -fsSL https://raw.githubusercontent.com/Yunz93/Modu/main/scripts/install-macos.sh | /bin/bash)
```

只需 macOS 自带工具。可设定安装目录、正式版本和是否安装后打开，例如：

```sh
(set -o pipefail; curl -fsSL https://raw.githubusercontent.com/Yunz93/Modu/main/scripts/install-macos.sh | INSTALL_DIR="$HOME/Applications" RELEASE_TAG=v0.1.1 OPEN_APP=0 /bin/bash)
```

脚本安装的是 GitHub 已发布的版本。它只替换应用包，阅读库继续使用原路径。

## 开发

需要 Node.js 22.22+、Rust 1.90+ 和 macOS Command Line Tools。

```sh
npm ci
npm run tauri:dev
```

浏览器预览：`npm run dev`。检查：

```sh
npm run typecheck
npm test
npm run test:native
npm run build
npm run test:sites
```

签名构建和发布资产准备见 [更新与发布](docs/UPDATER.md)。更新私钥不在仓库或客户端中。

## 数据

数据库位于 `~/Library/Application Support/com.yunz.modu/library.sqlite3`，恢复与更新前备份在同目录 `backups/`。新库尚不存在时，会从旧 `com.yunz.shidu` 目录复制一致的 SQLite 快照，包含已提交 WAL；原库不修改。`MODU_DATA_DIR` 可指定独立开发/验收目录。

订阅文件导入上限 5 MB，完整备份读取上限 128 MB，网络订阅单次下载上限 8 MB。更新包与阅读库分离，覆盖应用不删除阅读数据。HTML 清理后显示，正文链接交给默认浏览器。

## 设计与验证

[产品实现](docs/product-plan.md) · [墨知实践采用记录](docs/mozi-practice-adoption.md) · [视觉规范](DESIGN.md) · [验收记录](VALIDATION.md)

界面使用 React + TypeScript、Radix 和 Phosphor；原生服务使用 Tauri 2、Rust、SQLite、feed-rs 与标准签名更新器。本机截图、用户参考图和阅读库验收导出不随公开代码提交。原模板的 Sites 构建协议继续保留，未部署网页服务。
