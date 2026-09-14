function payloadOf(snapshot) { return snapshot && snapshot.payload ? snapshot.payload : {} }

function priorityOf(task) {
  if (task.important && task.urgent) return "red"
  if (task.urgent) return "yellow"
  if (task.important) return "blue"
  return "green"
}

function snapshotTasks(snapshot, limit) {
  const list = payloadOf(snapshot).tasks && payloadOf(snapshot).tasks.items
  return (Array.isArray(list) ? list : []).slice(0, limit || 20).map(item => ({
    id: item.id || "task-" + Math.random().toString(36).slice(2),
    title: item.title || "未命名任务",
    note: item.dueTime ? `${item.due || ""} ${item.dueTime}`.trim() : (item.due || ""),
    priority: priorityOf(item),
    completed: !!item.completed
  }))
}

function snapshotSchedule(snapshot) {
  const list = payloadOf(snapshot).schedule && payloadOf(snapshot).schedule.items
  return (Array.isArray(list) ? list : []).slice(0, 12).map(item => ({
    id: item.id || "schedule-" + Math.random().toString(36).slice(2),
    time: item.startTime || item.time || (item.startSection ? `第${item.startSection}节` : ""),
    title: item.title || item.name || "未命名安排",
    location: item.location || "地点待定",
    duration: item.duration || "",
    active: !!item.active
  }))
}

export { payloadOf, snapshotTasks, snapshotSchedule }
