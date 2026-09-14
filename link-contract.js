/*
 * Fangcun phone ↔ wearable data contract.
 * Transport is intentionally absent from this file: BLE, HTTP and future
 * vendor channels all consume the same snapshot shape.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FangcunLinkContract = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCHEMA = "fangcun.link.v1";
  const VERSION = 1;
  const DATA_STATES = new Set(["mock", "live", "stale", "empty"]);

  function iso(value) {
    const date = value ? new Date(value) : new Date();
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  function localDate(value = new Date()) {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
  }

  function text(value, fallback = "") { return typeof value === "string" ? value : fallback; }
  function list(value) { return Array.isArray(value) ? value : []; }

  function normalizeTask(task) {
    return {
      id: text(task.id), title: text(task.title, "未命名事项"), type: text(task.type, "task"),
      due: text(task.due), dueTime: text(task.dueTime), notes: text(task.notes),
      completed: Boolean(task.completed), important: task.important === true, urgent: task.urgent === true,
      projectId: text(task.projectId), courseId: text(task.courseId), updatedAt: iso(task.updatedAt || task.createdAt),
    };
  }

  function normalizeCourse(course) {
    return {
      id: text(course.id), name: text(course.name, "未命名课程"), teacher: text(course.teacher),
      location: text(course.location), day: Number(course.day) || 0, startSection: Number(course.startSection) || 0,
      endSection: Number(course.endSection) || 0, color: text(course.color), weeks: list(course.weeks).map(Number),
      updatedAt: iso(course.updatedAt || course.createdAt),
    };
  }

  function buildPayload(document, now = new Date()) {
    const today = localDate(now);
    const tasks = list(document && document.tasks).map(normalizeTask);
    const courses = list(document && document.courses).map(normalizeCourse);
    const scheduleItems = courses.filter((course) => course.day >= 1 && course.day <= 7).map((course) => ({
      id: course.id, kind: "course", title: course.name, location: course.location,
      day: course.day, startSection: course.startSection, endSection: course.endSection, color: course.color,
    }));
    const taskItems = tasks.filter((task) => !task.completed).sort((a, b) => `${a.due} ${a.dueTime}`.localeCompare(`${b.due} ${b.dueTime}`));
    return {
      deviceStatus: { state: "ready", battery: null, charging: null, firmware: null },
      schedule: { date: today, items: scheduleItems },
      tasks: { date: today, pendingCount: taskItems.length, items: taskItems.slice(0, 20) },
      syncState: { mode: "pull-only", cursor: null, canWrite: false, transport: "not-connected" },
    };
  }

  function buildSnapshot({ document = {}, revision = 0, updatedAt = null, dataState = "empty", source = "server", user = null, device = {} } = {}) {
    const state = DATA_STATES.has(dataState) ? dataState : "empty";
    const now = new Date();
    const safeRevision = Number.isInteger(Number(revision)) ? Number(revision) : 0;
    return {
      schema: SCHEMA, version: VERSION, type: "snapshot", messageId: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(), source, dataState: state,
      device: { id: text(device.id, "fangcun-phone"), kind: text(device.kind, "phone"), name: text(device.name, "方寸手机端"), platform: text(device.platform, "web"), capabilities: { snapshotRead: true, snapshotWrite: false } },
      account: user ? { id: String(user.id), displayName: text(user.displayName || user.display_name), username: text(user.username) } : null,
      sync: { revision: safeRevision, cursor: safeRevision ? String(safeRevision) : null, updatedAt: updatedAt ? iso(updatedAt) : null, lastSyncAt: updatedAt ? iso(updatedAt) : null, mode: "pull-only", canWrite: false },
      payload: buildPayload(document, now),
    };
  }

  function buildMockSnapshot() {
    return buildSnapshot({
      dataState: "mock", source: "local-fixture", revision: 0,
      document: {
        courses: [{ id: "mock-course-1", name: "大学物理", location: "东校 A301", day: 2, startSection: 3, endSection: 4, color: "#4F6BED" }],
        tasks: [{ id: "mock-task-1", title: "完成高等数学第一章作业", due: localDate(), dueTime: "23:59", important: true, urgent: true, completed: false }],
      },
    });
  }

  return { SCHEMA, VERSION, DATA_STATES, buildPayload, buildSnapshot, buildMockSnapshot, localDate };
});
