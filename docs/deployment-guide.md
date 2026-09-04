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

## 3. 一条命令升级服务器

Windows 已安装 OpenSSH 时运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\upload-and-upgrade.ps1 `
  -Server "你的服务器公网 IP 或 SSH 域名" `
  -UserName "admin" `
  -Port 22 `
  -IdentityFile "C:\Users\你的用户名\.ssh\id_ed25519"
```

如果 SSH 使用密码登录，可省略 `-IdentityFile`。脚本依次执行：本地全量检查、SCP 上传、服务器数据备份、安装并重启、健康接口检查、确认服务只监听 `127.0.0.1:18443`、显示最近日志。

首次安装还没有数据库时会跳过备份；升级时备份写入服务器 `/var/backups/fangcun/`。脚本不会修改阿里云安全组、防火墙、80/443、Hysteria 或 Cloudflare Tunnel。

## 4. 手动上传的等价命令

```powershell
scp -P 22 .\release\fangcun-release-2.7.0.tar.gz admin@服务器地址:/tmp/fangcun-release-2.7.0.tar.gz
ssh -p 22 admin@服务器地址
```

登录服务器后：

```bash
install -d -m 0700 /tmp/fangcun-release-2.7.0
tar -xzf /tmp/fangcun-release-2.7.0.tar.gz -C /tmp/fangcun-release-2.7.0
cd /tmp/fangcun-release-2.7.0
sudo bash deploy/backup.sh
sudo bash deploy/install.sh
sudo bash deploy/verify.sh
```

首次安装没有旧数据库时，直接省略 `backup.sh`。

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
