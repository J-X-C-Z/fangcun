(function initFangcunSmartParser(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FangcunSmartParser = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const weekdayMap = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7 };
  const digitMap = { "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };

  function pad(value) { return String(value).padStart(2, "0"); }
  function localISO(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function addDays(date, days) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
  function toNumber(value) {
    const source = String(value || "");
    if (/^\d+$/.test(source)) return Number(source);
    if (source.includes("十")) {
      const [left, right] = source.split("十");
      return (left ? digitMap[left] : 1) * 10 + (right ? digitMap[right] : 0);
    }
    if (source.length > 1) return Number([...source].map((char) => digitMap[char]).join(""));
    return digitMap[source];
  }

  function parseWeekSpec(value, maxWeeks = 20) {
    const source = String(value || "");
    const parity = /单周|单数周|\(单\)|（单）/.test(source) ? 1 : /双周|双数周|\(双\)|（双）/.test(source) ? 0 : null;
    const weeks = new Set();
    const rangePattern = /(\d+)\s*[-~～至到]\s*(\d+)\s*周?/g;
    let match;
    while ((match = rangePattern.exec(source))) {
      const start = Math.max(1, Math.min(maxWeeks, Number(match[1])));
      const end = Math.max(1, Math.min(maxWeeks, Number(match[2])));
      for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) {
        if (parity === null || week % 2 === parity) weeks.add(week);
      }
    }
    const withoutRanges = source.replace(/\d+\s*[-~～至到]\s*\d+\s*周?/g, " ");
    const singlePattern = /(?:第)?(\d+)\s*周/g;
    while ((match = singlePattern.exec(withoutRanges))) {
      const week = Number(match[1]);
      if (week >= 1 && week <= maxWeeks && (parity === null || week % 2 === parity)) weeks.add(week);
    }
    source.split(/[，,]/).map((part) => part.replace(/(?:单周|双周|单数周|双数周|[（(][单双][)）])/g, "").trim()).forEach((part) => {
      if (!/^\d+\s*周?$/.test(part)) return;
      const week = Number(part.replace("周", ""));
      if (week >= 1 && week <= maxWeeks && (parity === null || week % 2 === parity)) weeks.add(week);
    });
    if (!weeks.size && parity !== null) {
      for (let week = 1; week <= maxWeeks; week += 1) if (week % 2 === parity) weeks.add(week);
    }
    return [...weeks].sort((a, b) => a - b);
  }

  function parseDate(text, now = new Date()) {
    const source = String(text);
    if (/大后天/.test(source)) return localISO(addDays(now, 3));
    if (/后天/.test(source)) return localISO(addDays(now, 2));
    if (/明天|明早|明晚/.test(source)) return localISO(addDays(now, 1));
    if (/今天|今晚|今早/.test(source)) return localISO(now);
    if (/下周末/.test(source)) {
      const current = now.getDay() || 7;
      return localISO(addDays(now, 13 - current));
    }
    if (/(?:本周|这周)?周末/.test(source)) {
      const current = now.getDay() || 7;
      return localISO(addDays(now, 6 - current));
    }
    if (/月底|月末/.test(source)) return localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const nextMonthDay = source.match(/下个月\s*([\d一二三四五六七八九十两]{1,3})[日号]/);
    if (nextMonthDay) return localISO(new Date(now.getFullYear(), now.getMonth() + 1, toNumber(nextMonthDay[1])));
    const iso = source.match(/\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\b/);
    if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
    const monthDay = source.match(/(?:今年)?([\d一二三四五六七八九十两]{1,3})月([\d一二三四五六七八九十两]{1,3})[日号]?/);
    if (monthDay) {
      const month = toNumber(monthDay[1]);
      const day = toNumber(monthDay[2]);
      let date = new Date(now.getFullYear(), month - 1, day);
      if (date < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !/今年/.test(source)) date = new Date(now.getFullYear() + 1, month - 1, day);
      return localISO(date);
    }
    const bareDay = source.match(/(?:^|[^月\d])([\d一二三四五六七八九十两]{1,3})[日号](?:[^\d]|$)/);
    if (bareDay) {
      const day = toNumber(bareDay[1]);
      let date = new Date(now.getFullYear(), now.getMonth(), day);
      if (date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date = new Date(now.getFullYear(), now.getMonth() + 1, day);
      return localISO(date);
    }
    const weekday = source.match(/(下下周|下周|这周|本周)?(?:星期|周)([一二三四五六日天])/);
    if (weekday) {
      const target = weekdayMap[weekday[2]];
      const current = now.getDay() || 7;
      let distance = target - current;
      if (weekday[1] === "下下周") distance += distance > 0 ? 14 : 21;
      else if (weekday[1] === "下周") distance += distance > 0 ? 7 : 14;
      else if (distance < 0 || (!weekday[1] && distance === 0)) distance += 7;
      return localISO(addDays(now, distance));
    }
    return "";
  }

  function parseTime(text) {
    const source = String(text);
    const colon = source.match(/(?:上午|中午|下午|傍晚|晚上|今晚|明早|明晚)?\s*([01]?\d|2[0-3])[:：]([0-5]\d)/);
    const chinese = source.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|今晚|明早|明晚)?\s*([\d一二三四五六七八九十两]{1,3})\s*[点时](半|一刻|三刻|[\d一二三四五六七八九十两]{1,3}分?)?/);
    let hour;
    let minute;
    let period = "";
    if (colon) {
      hour = Number(colon[1]);
      minute = Number(colon[2]);
      period = colon[0];
    } else if (chinese) {
      hour = toNumber(chinese[2]);
      minute = chinese[3] === "半" ? 30 : chinese[3] === "一刻" ? 15 : chinese[3] === "三刻" ? 45 : toNumber(String(chinese[3] || "0").replace("分", ""));
      period = chinese[1] || "";
    } else return "";
    if (/下午|傍晚|晚上|今晚|明晚/.test(period) && hour < 12) hour += 12;
    if (/凌晨|早上|上午|明早/.test(period) && hour === 12) hour = 0;
    if (/中午/.test(period) && hour < 11) hour += 12;
    if (hour > 23 || minute > 59) return "";
    return `${pad(hour)}:${pad(minute)}`;
  }

  function parseTimeRange(text, date = "") {
    const token = "(?:凌晨|早上|上午|中午|下午|傍晚|晚上|今晚|明早|明晚)?\\s*(?:[01]?\\d|2[0-3]|[一二三四五六七八九十两]{1,3})(?::[0-5]\\d|[：][0-5]\\d|[点时](?:半|一刻|三刻|[一二三四五六七八九十两\\d]{1,3}分?)?)";
    const match = String(text).match(new RegExp(`(${token})\\s*(?:到|至|—|–|-|~|～)\\s*(${token})`));
    if (!match) return { startDate: "", startTime: "", endDate: "", endTime: "" };
    const startTime = parseTime(match[1]);
    let endTime = parseTime(match[2]);
    if (!startTime || !endTime) return { startDate: "", startTime: "", endDate: "", endTime: "" };
    const firstHasLatePeriod = /下午|傍晚|晚上|今晚|明晚/.test(match[1]);
    const secondHasPeriod = /凌晨|早上|上午|中午|下午|傍晚|晚上|今晚|明早|明晚/.test(match[2]);
    if (firstHasLatePeriod && !secondHasPeriod && Number(endTime.slice(0, 2)) < 12) endTime = `${pad(Number(endTime.slice(0, 2)) + 12)}:${endTime.slice(3)}`;
    const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3));
    const endMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3));
    const endDate = date && endMinutes < startMinutes ? localISO(addDays(new Date(`${date}T12:00:00`), 1)) : date;
    return { startDate: date, startTime, endDate, endTime };
  }

  function parseReminder(text) {
    const source = String(text);
    const match = source.match(/提前\s*([\d一二三四五六七八九十两]{1,3})\s*(分钟|分|小时|钟头|天)/);
    if (match) return toNumber(match[1]) * (/天/.test(match[2]) ? 1440 : /小时|钟头/.test(match[2]) ? 60 : 1);
    if (/(?:到时候|届时|准时)提醒/.test(source)) return 0;
    return -1;
  }

  function parseEstimate(text) {
    const match = String(text).match(/(?:预计|估计|大概|约|需要|持续)?\s*([\d一二三四五六七八九十两]{1,3})\s*(分钟|分|小时|钟头)/);
    if (!match) return 0;
    return toNumber(match[1]) * (/小时|钟头/.test(match[2]) ? 60 : 1);
  }

  function cleanTitle(text) {
    return String(text)
      .replace(/^(?:请)?(?:帮我)?(?:提醒我|记得|安排一下|安排|添加|新建|创建|记录|我要|我需要)\s*/g, " ")
      .replace(/(?:今天|明天|后天|大后天|今晚|明早|明晚|下下周|下周|这周|本周)?(?:星期|周)[一二三四五六日天]/g, " ")
      .replace(/(?:今天|明天|后天|大后天|今晚|明早|明晚|今早)/g, " ")
      .replace(/(?:20\d{2}[-/.年])?[\d一二三四五六七八九十两]{1,3}[-/.月][\d一二三四五六七八九十两]{1,3}日?/g, " ")
      .replace(/(?:凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*[\d一二三四五六七八九十两]{1,3}(?::\d{2}|[点时](?:半|一刻|三刻|[\d一二三四五六七八九十两]{1,3}分?)?)/g, " ")
      .replace(/\s*(?:到|至|—|–|~|～)\s*/g, " ")
      .replace(/提前\s*[\d一二三四五六七八九十两]{1,3}\s*(?:分钟|分|小时|钟头|天)(?:提醒)?|(?:到时候|届时|准时)提醒/g, " ")
      .replace(/(?:预计|估计|大概|约|需要|持续)?\s*[\d一二三四五六七八九十两]{1,3}\s*(?:分钟|分|小时|钟头)/g, " ")
      .replace(/(?:非常)?重要(?:且|和|、)?(?:非常)?紧急|重要不紧急|紧急不重要|不重要不紧急/g, " ")
      .replace(/(?:放到|加入|归入)(?:第一|第二|第三|第四|1|2|3|4)?象限/g, " ")
      .replace(/[,，。；;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findContextId(text, items) {
    return findContextMatches(text, items)[0]?.id || "";
  }

  function parseCourseDays(text) {
    const days = [];
    for (const match of String(text).matchAll(/(?:星期|周)([一二三四五六日天])/g)) {
      const day = weekdayMap[match[1]];
      if (day && !days.includes(day)) days.push(day);
    }
    return days;
  }

  function findContextMatches(text, items) {
    const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s·（）()《》\-_，,。:：]/g, "").replace(/(?:大学|课程|上|下)$/g, "");
    const source = normalize(text);
    return (items || []).filter((item) => {
      const name = normalize(item?.name);
      if (!name || name.length < 2) return false;
      if (source.includes(name)) return true;
      const aliases = [name.replace(/^大学/, ""), name.replace(/^大学/, "").replace(/[a-z]+\d*$/i, ""), name.replace(/[a-z]+\d*$/i, "")];
      return aliases.some((alias) => alias.length >= 2 && source.includes(alias));
    }).sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  }

  function parseLocation(text) {
    const source = String(text);
    const explicit = source.match(/(?:地点|地址|位置)[:：]\s*([^，,。；;]+)/);
    if (explicit) return explicit[1].trim();
    const natural = source.match(/在\s*([^，,。；;]{2,30}?)(?=\s*(?:开会|见面|讨论|上课|参加|聚餐|就诊|体检|面试|汇报|训练|考试))/);
    return natural?.[1]?.trim() || "";
  }

  function taskDecision(text, due, now) {
    const source = String(text);
    if (/重要不紧急/.test(source)) return { important: true, urgent: false };
    if (/紧急不重要/.test(source)) return { important: false, urgent: true };
    if (/不重要不紧急/.test(source)) return { important: false, urgent: false };
    if (/重要(?:且|和|、)?紧急|紧急(?:且|和|、)?重要/.test(source)) return { important: true, urgent: true };
    let important = /重要|考试|论文|答辩|科研|作业|申请|报名|复习|截止|组会|会议|课程/.test(source) ? true : null;
    let urgent = /紧急|立刻|马上|尽快|今天|今晚|明天|明早/.test(source) ? true : null;
    if (/不重要/.test(source)) important = false;
    if (/不紧急/.test(source)) urgent = false;
    if (urgent === null && due) {
      const days = Math.round((new Date(`${due}T12:00:00`) - new Date(localISO(now) + "T12:00:00")) / 86400000);
      if (days <= 2) urgent = true;
      else if (days >= 7) urgent = false;
    }
    return { important, urgent };
  }

  function parseCourse(text, context) {
    const maxWeeks = context.totalWeeks || 20;
    const dayMatch = text.match(/(?:每周|星期|周)([一二三四五六日天])/);
    const sectionMatch = text.match(/(?:第)?\s*(\d+)\s*[-~～至到]\s*(\d+)\s*节/) || text.match(/第\s*(\d+)\s*节/);
    const codeMatch = text.match(/\b[A-Z]{2,8}\d{3,5}(?:[_-]\d+)?\b/i);
    const locationMatch = text.match(/((?:[\u4e00-\u9fa5]{2,8}校区\s*)?[A-Za-z]\d{1,3}-\d{2,4})/);
    const teacherMatch = text.match(/(?:教师|老师)[:：]?\s*([\u4e00-\u9fa5]{2,5})/) || text.match(/([\u4e00-\u9fa5]{2,5})老师/);
    let name = text
      .replace(/^(?:添加|新建|安排)?\s*(?:一门)?课程[:：]?/i, "")
      .replace(/(?:每周|星期|周)[一二三四五六日天]/g, " ")
      .replace(/(?:第)?\s*\d+\s*[-~～至到]\s*\d+\s*节|第\s*\d+\s*节/g, " ")
      .replace(/\d+\s*[-~～至到]\s*\d+\s*周\s*[（(]?[单双]?[)）]?|(?:单周|双周)/g, " ")
      .replace(/提前\s*\d+\s*(?:分钟|分|小时|钟头)(?:提醒)?/g, " ");
    if (codeMatch) name = name.replace(codeMatch[0], " ");
    if (locationMatch) name = name.replace(locationMatch[0], " ");
    if (teacherMatch) name = name.replace(teacherMatch[0], " ");
    name = name.replace(/(?:在|地点|教室|老师|教师)[:：]?/g, " ").replace(/[,，。；;]+/g, " ").replace(/\s+/g, " ").trim();
    const weeks = parseWeekSpec(text, maxWeeks);
    const issues = [];
    if (!dayMatch) issues.push({ field: "day", message: "还不知道星期几上课" });
    if (!sectionMatch) issues.push({ field: "section", message: "还不知道上课节次" });
    return {
      kind: "course",
      title: name || "未命名课程",
      name: name || "未命名课程",
      code: codeMatch?.[0] || "",
      campus: locationMatch?.[1]?.match(/[\u4e00-\u9fa5]{2,8}校区/)?.[0] || "",
      location: locationMatch?.[1]?.replace(/[\u4e00-\u9fa5]{2,8}校区\s*/, "") || "",
      teacher: teacherMatch?.[1] || "",
      day: dayMatch ? weekdayMap[dayMatch[1]] : 1,
      startSection: sectionMatch ? Number(sectionMatch[1]) : 1,
      endSection: sectionMatch ? Number(sectionMatch[2] || sectionMatch[1]) : 1,
      weeks: weeks.length ? weeks : Array.from({ length: maxWeeks }, (_, index) => index + 1),
      reminderMinutes: parseReminder(text) >= 0 ? parseReminder(text) : 10,
      notes: "由智能收集识别，请确认节次与周次。",
      issues,
      confidence: issues.length ? "needs-confirmation" : "high",
    };
  }

  function parseProject(text, context) {
    const due = parseDate(text, context.now);
    const parts = text.split(/下一步(?:行动)?[:：]?/);
    const name = cleanTitle(parts[0].replace(/^(?:建立|新建|添加)?\s*(?:长期项目|长期目标|项目|目标)[:：]?/, "")) || "未命名项目";
    const nextAction = cleanTitle(parts[1] || "");
    const issues = nextAction ? [] : [{ field: "nextAction", message: "还没有写清第一项可执行行动" }];
    return { kind: "project", title: name, name, goal: "", due, color: "sage", nextAction, issues, confidence: issues.length ? "needs-confirmation" : "high" };
  }

  function parseTask(text, context) {
    const due = parseDate(text, context.now);
    const range = parseTimeRange(text, due);
    const parsedTime = parseTime(text);
    const decision = taskDecision(text, due, context.now);
    const issues = [];
    const projectMatches = findContextMatches(text, context.projects);
    const courseMatches = findContextMatches(text, context.courses);
    let repeat = "none";
    if (/每天|每日/.test(text)) repeat = "daily";
    else if (/每个?工作日|周一至周五/.test(text)) repeat = "weekdays";
    else if (/每周/.test(text)) repeat = "weekly";
    else if (/每月/.test(text)) repeat = "monthly";
    const eventLike = /会议|组会|开会|见面|讨论|约会|日程|上课|参加|聚餐|就诊|体检|面试|拜访|预约|汇报|训练/.test(text) || Boolean(range.startTime);
    const type = /考试|测验/.test(text) ? "exam" : /作业|报告/.test(text) ? "assignment" : /复习/.test(text) ? "review" : eventLike ? "event" : "task";
    if (decision.important === null && (type === "event" || projectMatches.length || courseMatches.length)) decision.important = true;
    if (decision.important === null) decision.important = false;
    if (decision.urgent === null) decision.urgent = false;
    const deadlineLike = /截止|之前|前(?:交|提交|完成)|交作业|提交|到期/.test(text);
    if (!due && /下周|下下周|这周|本周|周末|月底|月末/.test(text)) issues.push({ field: "due", message: "日期范围不够具体，请确认哪一天" });
    if (!due && (range.startTime || parsedTime) && /今天|明天|后天|大后天/.test(text) === false) issues.push({ field: range.startTime ? "startDate" : "due", message: "识别到了时间，但没有明确日期" });
    if (courseMatches.length > 1) issues.push({ field: "courseId", message: "匹配到多门课程，请选择关联课程" });
    if (projectMatches.length > 1) issues.push({ field: "projectId", message: "匹配到多个项目，请选择关联项目" });
    let eventStartDate = range.startDate;
    let eventStartTime = range.startTime;
    let eventEndDate = range.endDate;
    let eventEndTime = range.endTime;
    let taskDue = due;
    let dueTime = parsedTime;
    const estimateMinutes = parseEstimate(text);
    if (type === "event" && !deadlineLike) {
      eventStartDate = eventStartDate || due;
      eventStartTime = eventStartTime || parsedTime;
      taskDue = "";
      dueTime = "";
      if (eventStartTime && !eventEndTime) {
        const startMinutes = Number(eventStartTime.slice(0, 2)) * 60 + Number(eventStartTime.slice(3));
        const endMinutes = startMinutes + (estimateMinutes || 60);
        eventEndDate = eventStartDate;
        eventEndTime = `${pad(Math.floor((endMinutes % 1440) / 60))}:${pad(endMinutes % 60)}`;
        if (endMinutes >= 1440 && eventStartDate) eventEndDate = localISO(addDays(new Date(`${eventStartDate}T12:00:00`), 1));
      }
    }
    if (type === "event" && /(?:上午|中午|下午|傍晚|晚上|今晚|明早|明晚)/.test(text) && !parsedTime) issues.push({ field: "startTime", message: "识别到大致时段，请确认具体时间" });
    const location = parseLocation(text);
    let title = cleanTitle(text).replace(/(?:地点|地址|位置)[:：]\s*[^，,。；;]+/g, " ");
    if (location) title = title.replace(new RegExp(`在\\s*${location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), " ");
    title = title.replace(/\s+/g, " ").trim() || text.trim();
    return {
      kind: "task", title, notes: "", due: taskDue, dueTime, repeat, type,
      startDate: eventStartDate, startTime: eventStartTime,
      endDate: eventEndDate, endTime: eventEndTime, location,
      projectId: projectMatches.length === 1 ? projectMatches[0].id : "",
      courseId: courseMatches.length === 1 ? courseMatches[0].id : "",
      projectCandidates: projectMatches.map((item) => ({ id: item.id, name: item.name })),
      courseCandidates: courseMatches.map((item) => ({ id: item.id, name: item.name })),
      reminderMinutes: parseReminder(text),
      estimateMinutes,
      important: decision.important, urgent: decision.urgent,
      today: due === localISO(context.now), issues, confidence: issues.length ? "needs-confirmation" : "high",
    };
  }

  function parseNaturalInput(value, options = {}) {
    const text = String(value || "").trim();
    if (!text) return null;
    const context = { now: options.now ? new Date(options.now) : new Date(), totalWeeks: Number(options.totalWeeks) || 20, projects: options.projects || [], courses: options.courses || [] };
    if (/^(?:建立|新建|添加)?\s*(?:长期项目|长期目标|项目|目标)[:：]?/.test(text)) return parseProject(text, context);
    const courseLike = /(?:每周|星期|周)[一二三四五六日天]/.test(text) && /(?:第?\s*\d+\s*[-~～至到]\s*\d+\s*节|第\s*\d+\s*节)/.test(text);
    if (/^(?:添加|新建|安排)?\s*(?:一门)?课程[:：]?/.test(text) || courseLike) return parseCourse(text, context);
    return parseTask(text, context);
  }

  function parseNaturalBatch(value, options = {}) {
    return String(value || "").split(/\r?\n|；/).map((item) => item.trim()).filter(Boolean).flatMap((item) => {
      const parsed = parseNaturalInput(item, options);
      if (!parsed || parsed.kind !== "course") return parsed ? [parsed] : [];
      const days = parseCourseDays(item);
      if (days.length <= 1) return [parsed];
      return days.map((day) => {
        const issues = (parsed.issues || []).filter((issue) => issue.field !== "day");
        return { ...parsed, day, issues, confidence: issues.length ? "needs-confirmation" : "high" };
      });
    });
  }

  return { parseNaturalInput, parseNaturalBatch, parseWeekSpec, parseDate, parseTime, parseTimeRange, parseReminder, parseEstimate };
}));
