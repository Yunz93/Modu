# 墨牍更新与发布

## 用户契约

应用内「关于墨牍与更新」提供当前版本、自动检查开关、手动检查、更新说明、跳过版本、下载进度、取消下载和安装重启。自动检查只提示，不打开弹窗、不自动安装；错误与“已是最新版”明确区分。未知下载大小使用不定进度，传输结束进入验签阶段。

下载期间继续阅读；安装前临时阻止新输入，最后保存已读、收藏、正文位置与偏好，再核对 SQLite revision 并写出更新前 JSON 备份。保存失败或超过 15 秒则停止安装、解除交互保护。安装交给 Tauri 标准更新器处理替换与失败恢复；更新后显式重启。应用不会清理系统隔离标记。

仅接收正式版 Apple Silicon 包，使用 SemVer 比较版本。更新清单固定为 `https://github.com/Yunz93/Modu/releases/latest/download/latest.json`；资产必须来自同仓库、同版本 tag，格式为 `.app.tar.gz`。公钥固定在应用配置中，私钥位于仓库之外；签名绑定版本，避免旧包冒充新版。来源、签名、版本、平台任一不符即拒绝安装。

0.1.0 的拾读不含更新器，需要手动安装一次 0.1.1。新应用标识为 `com.yunz.modu`，首次启动会在线备份复制 `com.yunz.shidu` 的 SQLite 阅读库；包含已提交 WAL，旧库保持原样，新库存在时不重复覆盖。

## 本地签名与候选包

墨牍使用独立更新密钥，不复用墨知。当前私钥保存在 `~/.config/modu/updater.key`，目录权限 700，文件权限 600；不要提交或上传私钥。客户端只嵌入公钥。也可通过 `TAURI_SIGNING_PRIVATE_KEY_PATH` 指定受保护密钥，或通过标准 Tauri 环境变量传入。

```sh
npm run release:version -- v0.1.1
npm ci
npm run typecheck
npm test
npm run test:native
npm run tauri:build
npm run test:sites
npm run package:mac
npm run release:manifest
```

版本来自发布 tag，同步 package.json、锁文件、Cargo.toml、Tauri 配置。Tauri 构建入口运行实际前端构建，生成 `.app.tar.gz` 和 `.sig`。候选目录为 `release/v0.1.1/`，包含 DMG、更新包、签名、`latest.json`、SHA-256。`release:manifest` 核对清单、资产和来源，使用仓库配置中的可信公钥验签，并核对受保护的版本号。

发布须先验证候选包，再上传完整资产，最后切换可发现入口。发布后运行 `npm run release:verify`，以无登录状态重新下载 GitHub 字节，校验 SHA-256、可信签名与签名版本，以及稳定端点。当前本机持有签名密钥并生成候选资产；GitHub 不持有签名私钥。仓库 CI 仅运行无私钥检查。更新包签名、macOS 代码签名和 Apple 公证是三种不同责任；当前 macOS 包使用 ad-hoc 代码签名，未做 Apple 公证。

## 验收隔离

`update-qa` 是显式编译功能，仅用于本机回环地址验收；只有此功能构建的客户端才读取 `MODU_QA_UPDATE_ENDPOINT`。正式构建不启用该功能，配置只接受 HTTPS。可用 `MODU_DATA_DIR` 指定独立阅读库，旧 `SHIDU_DATA_DIR` 别名继续兼容。

必须分别记录：自动化规则检查、实际签名拒绝、旧客户端真实下载/安装/重启，以及发布后从 GitHub 重新下载的实际字节校验。成功的本地包不能替代公网资产校验。
