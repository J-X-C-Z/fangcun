# 方寸 2.7.0 发布、服务器升级、密码恢复与 APK 安装

本说明对应项目源码根目录（即本仓库）。发布脚本不会开放服务器端口；方寸仍只监听 `127.0.0.1:18443`，继续由 Cloudflare Tunnel 代理。

## 1. 本地完整检查

```powershell
cd <项目源码根目录>
npm run check
```

只有全部检查通过才继续。

## 2. 生成服务器源码包

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\build-release.ps1
```

输出：

- `release/fangcun-release-2.7.0.tar.gz`
- 屏幕上同时显示 SHA-256，可在上传前后核对

## 3. 阿里云 Workbench 上传（默认部署方式）

使用阿里云控制台的 Workbench 登录服务器。通过文件上传，将本次交付的两个文件放到服务器 `/tmp/`；如果上传到了其他目录，请在下面命令里使用实际路径。

- `fangcun-release-2.7.0.tar.gz`
- `fangcun-SHA256SUMS-20260908.txt`

不需要在 Windows 执行 SSH/SCP，也不需要开放安全组端口。APK 留在本地发给手机安装，不放进服务器程序目录。

## 4. 在 Workbench 终端执行升级

下面是已有方寸服务的升级流程。校验或备份失败会停止，不会继续安装。临时解压目录使用随机名称，避免混入旧包文件。

```bash
(
  set -euo pipefail
  cd /tmp
  test -f fangcun-release-2.7.0.tar.gz
  sha256sum --check --ignore-missing fangcun-SHA256SUMS-20260908.txt
  FANGCUN_STAGE=$(mktemp -d /tmp/fangcun-upgrade.XXXXXX)
  tar -xzf /tmp/fangcun-release-2.7.0.tar.gz -C "$FANGCUN_STAGE"
  cd "$FANGCUN_STAGE"
  sudo bash deploy/backup.sh
  sudo bash deploy/install.sh
  sudo bash deploy/verify.sh
  curl --fail --silent --show-error http://127.0.0.1:18443/app.js | grep 'const APP_BUILD ='
)
```

最后应看到构建标识 `20260908-calendar-controls`。本次文件名仍含 2.7.0，必须使用本次哈希文件，不要混用 9 月 7 日的旧包或哈希。

首次安装没有旧数据库时省略 `backup.sh`。升级备份保存在 `/var/backups/fangcun/`；现有备份脚本保留最近 30 天。安装脚本保留 `/var/lib/fangcun/` 数据和现有 `/etc/fangcun.env`，不会修改 Cloudflare Tunnel 或安全组。这里不需要配置任何应用商店信息。

部署完成后，在网页关闭再重新打开方寸；有更新提示时确认更新。如果仍显示旧构建，先检查域名侧缓存，不要先清除本机数据。手机需要覆盖安装本次 APK（versionCode 33），原生安全区和浏览器授权失败反馈需要新 APK。仅更新网页不能修复旧壳问题；不要先卸载，以免清掉尚未同步的本机数据。

### 应用商店生产信息

准备商店候选版时，在服务器 `/etc/fangcun.env` 中加入与开发者主体、隐私政策和备案材料完全一致的公开信息：

```dotenv
FANGCUN_OPERATOR_NAME=公开运营者名称
FANGCUN_CONTACT=公开联系方式
FANGCUN_APP_BEIAN=APP备案号
FANGCUN_ICP_BEIAN=ICP备案号
FANGCUN_STORE_RELEASE=true
```

然后重启并执行商店模式验收：

```bash
sudo systemctl restart fangcun
sudo bash /opt/fangcun/deploy/verify.sh
curl --fail https://你的方寸域名/privacy.html
```

在真实信息和备案取得前不要把 `FANGCUN_STORE_RELEASE` 设为 `true`，也不要提交商店审核。

## 5. 配置 Outlook 双向同步

在服务器 `/etc/fangcun.env` 中配置 Microsoft Entra 应用信息：

```bash
sudoedit /etc/fangcun.env
```

```dotenv
MICROSOFT_CLIENT_ID=你的应用客户端ID
MICROSOFT_CLIENT_SECRET=你的客户端密钥值
MICROSOFT_TENANT=common
MICROSOFT_REDIRECT_URI=https://你的方寸域名/api/integrations/outlook/callback
```

保存后执行：

```bash
sudo systemctl restart fangcun
sudo bash /opt/fangcun/deploy/verify.sh
```

完整的 Entra 回调地址、权限与 REDMI 日历设置见 `docs/calendar-sync-guide.md`。

## 5.5 忘记普通账号或 owner 密码时

服务器不会保存明文密码，因此旧密码无法查看或导出。升级到 2.7.0 后，在阿里云 Workbench 终端运行：

```bash
sudo bash /opt/fangcun/deploy/reset-password.sh '<用户名>'
sudo bash /opt/fangcun/deploy/reset-password.sh owner
```

脚本会隐藏输入、要求确认两次、重新启用账号，并注销该账号在所有设备上的旧会话。不要把新密码直接写进命令行或聊天记录。

## 6. 构建 APK

项目已经提供可重复构建脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\android\build-apk.ps1
```

第一次会将官方 JDK 17、Android SDK 36、Build Tools 36.0.0 与 Gradle 9.5 放到项目 `.tooling/`；以后可以加 `-SkipDownloads`。输出测试包：

```text
release/fangcun-v2.7.0-debug.apk
```

测试包适合自己安装验收，不应用于公开商店或长期分发。正式签名配置见 `android/README.md`，生产密钥必须离线备份并永久保留。

## 7. 安装到 REDMI

开启手机“开发者选项 → USB 调试”，连接电脑后：

```powershell
.\.tooling\android-sdk\platform-tools\adb.exe devices
.\.tooling\android-sdk\platform-tools\adb.exe install -r .\release\fangcun-v2.7.0-debug.apk
```

首次启动允许通知和日历读写权限；在小米应用设置中允许自启动、后台运行，并把省电策略设为无限制。日历互通入口位于方寸“日历 → 同步与导入”。

## 8. 回滚

如果升级后必须回滚，先停止服务，再从 `/var/backups/fangcun/` 选择升级前备份。不要在无法确认文件名时使用通配符覆盖：

```bash
sudo systemctl stop fangcun
sudo cp --preserve=mode,timestamps /var/backups/fangcun/明确的备份文件.sqlite /var/lib/fangcun/fangcun.sqlite
sudo chown fangcun:fangcun /var/lib/fangcun/fangcun.sqlite
sudo systemctl start fangcun
sudo bash /opt/fangcun/deploy/verify.sh
```
