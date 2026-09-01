package app.fangcun;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

final class ReminderScheduler {
    private static final String PREFS = "fangcun_native_reminders";
    private static final String PAYLOAD = "payload";

    private ReminderScheduler() {}

    static synchronized void replaceAll(Context context, String payload) {
        cancelStored(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PAYLOAD, payload).apply();
        schedulePayload(context, payload);
    }

    static synchronized void rescheduleStored(Context context) {
        String payload = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PAYLOAD, "");
        if (!payload.isEmpty()) schedulePayload(context, payload);
    }

    private static void cancelStored(Context context) {
        String payload = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PAYLOAD, "");
        if (payload.isEmpty()) return;
        try {
            JSONArray items = new JSONObject(payload).optJSONArray("items");
            if (items == null) return;
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            for (int index = 0; index < items.length(); index++) {
                String id = items.getJSONObject(index).optString("id");
                manager.cancel(alarmIntent(context, id, "", ""));
            }
        } catch (Exception ignored) {}
    }

    private static void schedulePayload(Context context, String payload) {
        try {
            JSONArray items = new JSONObject(payload).optJSONArray("items");
            if (items == null) return;
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            long now = System.currentTimeMillis();
            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.getJSONObject(index);
                long at = item.optLong("at");
                if (at <= now) continue;
                PendingIntent pending = alarmIntent(context, item.optString("id"), item.optString("title", "方寸提醒"), item.optString("body"));
                if (Build.VERSION.SDK_INT >= 31 && manager.canScheduleExactAlarms()) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                else if (Build.VERSION.SDK_INT >= 23) manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                else manager.setExact(AlarmManager.RTC_WAKEUP, at, pending);
            }
        } catch (Exception ignored) {}
    }

    private static PendingIntent alarmIntent(Context context, String id, String title, String body) {
        Intent intent = new Intent(context, ReminderReceiver.class)
            .putExtra("id", id)
            .putExtra("title", title)
            .putExtra("body", body);
        int requestCode = id.hashCode() & 0x7fffffff;
        return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
