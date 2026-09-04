# 方寸 2.7.0 交付与上线清单

## 交付物

- `release/fangcun-v2.7.0-debug.apk`：个人测试与覆盖安装包。
- `release/fangcun-release-2.7.0.tar.gz`：阿里云服务器升级包。

升级不会主动开放公网端口。服务继续只监听 `127.0.0.1:18443`，公网入口仍由现有 Cloudflare Tunnel 提供。

## 阿里云 Workbench 手动升级

先把服务器包上传到 `/home/admin/`，然后执行：

```bash
install -d -m 0700 /home/admin/fangcun-2.7.0
tar -xzf /home/admin/fangcun-release-2.7.0.tar.gz -C /home/admin/fangcun-2.7.0
cd /home/admin/fangcun-2.7.0
sudo bash deploy/backup.sh
sudo bash deploy/install.sh
sudo bash deploy/verify.sh
curl --fail --silent http://127.0.0.1:18443/api/health
```

首次安装、尚无 `/var/lib/fangcun/fangcun.sqlite` 时省略 `backup.sh`。升级完成后不要删除 `/var/backups/fangcun/` 中的升级前快照。

## APK 安装与小米权限

优先直接覆盖安装以保留登录和本机状态：

```powershell
.\.tooling\android-sdk\platform-tools\adb.exe install -r .\release\fangcun-v2.7.0-debug.apk
```

在手机系统设置中为方寸允许：通知、日历读写、闹钟和提醒、自启动、后台活动，并把电池策略设为无限制。系统日历入口在“日历 → 同步与导入”。

系统闹钟模式只对未来 24 小时内的提醒打开系统时钟并预填时间和名称，用户仍需确认保存。远期提醒自动使用方寸原生精确通知，避免系统时钟在错误日期提前响铃。

## 当前功能边界

本版不接入第三方语音助手。自然语言识别只在方寸的快捷输入中运行，识别结果会先显示预览，确认后才写入。提醒由方寸通知或用户确认后的系统闹钟承担。
