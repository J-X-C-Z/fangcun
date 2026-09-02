const assert = require("node:assert/strict");
const { parseNaturalInput, parseNaturalBatch, parseWeekSpec } = require("./smart-parser.js");

const context = {
  now: new Date("2026-08-25T09:00:00+08:00"),
  totalWeeks: 17,
  projects: [{ id: "research", name: "科研项目" }],
  courses: [{ id: "physics", name: "大学物理" }],
};

const task = parseNaturalInput("明天下午3点交大学物理作业，重要紧急，提前1小时提醒", context);
assert.equal(task.kind, "task");
assert.equal(task.due, "2026-08-26");
assert.equal(task.dueTime, "15:00");
assert.equal(task.type, "assignment");
assert.equal(task.courseId, "physics");
assert.equal(task.reminderMinutes, 60);
assert.equal(task.important, true);
assert.equal(task.urgent, true);

const meeting = parseNaturalInput("明天下午3点到5点参加科研项目组会，重要不紧急，提前30分钟提醒", context);
assert.equal(meeting.type, "event");
assert.equal(meeting.startDate, "2026-08-26");
assert.equal(meeting.startTime, "15:00");
assert.equal(meeting.endDate, "2026-08-26");
assert.equal(meeting.endTime, "17:00");
assert.equal(meeting.projectId, "research");
assert.equal(meeting.important, true);
assert.equal(meeting.urgent, false);
assert.equal(meeting.reminderMinutes, 30);

const course = parseNaturalInput("每周二第1-2节 大学物理 1-17周 湖畔校区B12-201 提前10分钟", context);
assert.equal(course.kind, "course");
assert.equal(course.day, 2);
assert.equal(course.startSection, 1);
assert.equal(course.endSection, 2);
assert.equal(course.weeks.length, 17);
assert.equal(course.location, "B12-201");

const oddWeeks = parseWeekSpec("1-17周（单）", 17);
assert.deepEqual(oddWeeks, [1, 3, 5, 7, 9, 11, 13, 15, 17]);

const project = parseNaturalInput("建立长期项目：科研论文，12月20日完成，下一步：阅读三篇综述", context);
assert.equal(project.kind, "project");
assert.equal(project.nextAction, "阅读三篇综述");

const estimated = parseNaturalInput("明天下午三点交大学物理实验报告，预计45分钟，提前一天提醒", context);
assert.equal(estimated.estimateMinutes, 45);
assert.equal(estimated.reminderMinutes, 1440);
assert.equal(estimated.issues.length, 0);

const ambiguous = parseNaturalInput("下周交大学物理实验报告", context);
assert.equal(ambiguous.due, "");
assert.equal(ambiguous.issues[0].field, "due");

const twoCourses = parseNaturalInput("明天交物理作业", { ...context, courses: [{ id: "a", name: "物理" }, { id: "b", name: "物理作业" }] });
assert.equal(twoCourses.courseId, "");
assert.ok(twoCourses.issues.some((issue) => issue.field === "courseId"));

assert.equal(parseNaturalBatch("今天交报告；每周三第6-8节 形势与政策 11-13周", context).length, 2);
const multiDayCourse = parseNaturalBatch("课程 大学物理，周二、周五第1-2节，1-17周，湖畔校区B12-201，张老师，提前15分钟提醒", context);
assert.equal(multiDayCourse.length, 2);
assert.deepEqual(multiDayCourse.map((item) => item.day), [2, 5]);
assert.ok(multiDayCourse.every((item) => item.startSection === 1 && item.endSection === 2 && item.weeks.length === 17));
assert.ok(multiDayCourse.every((item) => item.reminderMinutes === 15));
console.log("智能收集检查通过：任务、课程、单双周、长期项目与批量识别均正常。");
