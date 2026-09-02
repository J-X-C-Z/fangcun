const fs = require("node:fs");
const path = require("node:path");

const required = [
  "android/settings.gradle.kts",
  "android/build.gradle.kts",
  "android/app/build.gradle.kts",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/java/app/fangcun/MainActivity.java",
  "android/app/src/main/java/app/fangcun/ReminderScheduler.java",
  "android/app/src/main/java/app/fangcun/ReminderReceiver.java",
  "android/app/src/main/java/app/fangcun/BootReceiver.java",
  "android/app/src/main/java/app/fangcun/SystemCalendarBridge.java",
];
required.forEach((file) => { if (!fs.existsSync(path.resolve(file))) throw new Error(`安卓端缺少文件：${file}`); });

const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const activity = fs.readFileSync("android/app/src/main/java/app/fangcun/MainActivity.java", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const gradle = fs.readFileSync("android/app/build.gradle.kts", "utf8");
for (const permission of ["POST_NOTIFICATIONS", "SCHEDULE_EXACT_ALARM", "RECEIVE_BOOT_COMPLETED", "READ_CALENDAR", "WRITE_CALENDAR", "com.android.alarm.permission.SET_ALARM"]) {
  if (!manifest.includes(permission)) throw new Error(`安卓端缺少权限声明：${permission}`);
}
if (!activity.includes("https://fangcun.example.org/") || !activity.includes("FangcunNative")) throw new Error("安卓端未绑定可信域名或原生桥");
if (!app.includes("syncNativeReminders") || !app.includes("requestReminderPermissions")) throw new Error("网页端未接入安卓提醒桥");
if (!manifest.includes('android:scheme="fangcun" android:host="voice"')) throw new Error("安卓壳未注册方寸语音深链");
if (!activity.includes('"voice".equalsIgnoreCase(data.getHost())') || !activity.includes('appendQueryParameter("quick", "voice")') || !activity.includes('appendQueryParameter("text", text.trim())')) throw new Error("安卓壳缺少安全的语音深链或快捷输入预填");
if (activity.includes('"api/voice/command"') || activity.includes("CookieManager.getInstance().getCookie(APP_URL)")) throw new Error("外部语音深链不得复用登录会话直接修改数据");
const reminderScheduler = fs.readFileSync("android/app/src/main/java/app/fangcun/ReminderScheduler.java", "utf8");
for (const alarmPart of ["AlarmClock.ACTION_SET_ALARM", "AlarmClock.EXTRA_HOUR", "AlarmClock.EXTRA_MINUTES", "AlarmClock.EXTRA_MESSAGE", "AlarmClock.EXTRA_SKIP_UI", "systemAlarm"]) if (!reminderScheduler.includes(alarmPart)) throw new Error(`系统闹钟意图缺少：${alarmPart}`);
if (!reminderScheduler.includes("已预填系统闹钟，请在时钟中确认保存") || !reminderScheduler.includes("continue;")) throw new Error("系统闹钟模式未提供确认降级或仍会重复调度应用内提醒");
if (!reminderScheduler.includes("SYSTEM_ALARM_WINDOW_MS") || !reminderScheduler.includes("at - now <= SYSTEM_ALARM_WINDOW_MS")) throw new Error("远期事项不得提前写成错误日期的系统闹钟");
if (!app.includes("taskAlarmMode") || !app.includes("courseAlarmMode") || !app.includes("systemAlarm: Boolean")) throw new Error("网页提醒编辑器未保存或下发系统闹钟模式");
if (!app.includes("/api/voice/token") || !app.includes("/api/voice/commands") || !app.includes("FangcunVoiceCommandCreated")) throw new Error("网页设置缺少语音令牌、日志、撤销或壳内刷新链路");
if (!gradle.includes('versionName = "2.7.0"')) throw new Error("安卓版本号不是 v2.7.0");
if (!activity.includes("configureEdgeToEdgeWindow")) throw new Error("安卓壳应启用 edge-to-edge 横屏画布");
if (!activity.includes("LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES")) throw new Error("安卓壳应覆盖横屏短边刘海区域，避免黑边");
if (!activity.includes("readSystemCalendar") || !activity.includes("syncSystemCalendar") || !activity.includes('"fangcun"') || !activity.includes('"outlook-connected"') || !activity.includes('"google-connected"') || !activity.includes('"accounts.google.com"')) throw new Error("安卓壳缺少系统日历双向桥或 OAuth 返回链路");
const calendarBridge = fs.readFileSync("android/app/src/main/java/app/fangcun/SystemCalendarBridge.java", "utf8");
if (!calendarBridge.includes("CalendarContract.ACCOUNT_TYPE_LOCAL") || !calendarBridge.includes("Events.SYNC_DATA1") || !calendarBridge.includes("replaceReminder")) throw new Error("安卓系统日历桥缺少专用日历、稳定映射或提醒同步");
if (!calendarBridge.includes("insert(asSyncAdapter(Events.CONTENT_URI, account)") || !calendarBridge.includes("update(asSyncAdapter(eventUri, account)") || !calendarBridge.includes("delete(asSyncAdapter(eventUri, account)")) throw new Error("安卓系统日历桥写入同步字段时未使用 Sync Adapter URI");
if (calendarBridge.includes("insert(Events.CONTENT_URI") || calendarBridge.includes("update(eventUri, values") || calendarBridge.includes("delete(eventUri, null")) throw new Error("安卓系统日历桥仍存在普通 URI 写入同步字段的回归风险");
console.log("安卓端检查通过：系统闹钟、语音深链、可信域名壳、通知/日历权限和开机恢复结构完整。");
