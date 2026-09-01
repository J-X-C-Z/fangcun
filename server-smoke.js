const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("测试服务器未能按时启动");
}

async function main() {
  const port = await freePort();
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-test-"));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDirectory, FANGCUN_PASSWORD: "test-password-123", NODE_NO_WARNINGS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    await waitForServer(origin);
    const session = await fetch(`${origin}/api/auth/session`).then((response) => response.json());
    assert.equal(session.configured, true);
    assert.equal(session.authenticated, false);
    assert.equal(session.registrationOpen, false);
    assert.equal(session.version, "2.6.0");
    const mobileLayout = await fetch(`${origin}/v22-layout.css?v=2.6.0`);
    assert.equal(mobileLayout.status, 200, "服务端必须实际提供最终移动布局，不能只在安装目录里存在");
    assert.match(mobileLayout.headers.get("content-type") || "", /text\/css/);
    const wordParser = await fetch(`${origin}/docx-schedule-parser.js?v=2.6.0`);
    assert.equal(wordParser.status, 200, "服务端必须提供 Word 课表解析模块");

    const failedLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "owner", password: "incorrect-password" }),
    });
    assert.equal(failedLogin.status, 401);

    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "owner", password: "test-password-123" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const authHeaders = { Cookie: cookie, Origin: origin };
    const ownerSession = await fetch(`${origin}/api/auth/session`, { headers: authHeaders }).then((response) => response.json());
    assert.equal(ownerSession.user.username, "owner");
    assert.equal(ownerSession.user.role, "admin");

    const empty = await fetch(`${origin}/api/data`, { headers: authHeaders }).then((response) => response.json());
    assert.equal(empty.revision, 0);
    assert.equal(empty.data, null);

    const document = { tasks: [{ id: "owner-task", title: "迁移验证任务", completed: false, due: "2026-09-01", quadrant: "q1" }], projects: [{ id: "owner-project", name: "科研项目" }], courses: [{ id: "owner-course", name: "大学物理" }], timeSlots: [{ number: 1, startTime: "08:00", endTime: "09:00" }], courseExceptions: [], semester: {}, settings: {} };
    const firstSave = await fetch(`${origin}/api/data`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ data: document, baseRevision: 0 }),
    });
    assert.equal(firstSave.status, 200);
    assert.equal((await firstSave.json()).revision, 1);

    const staleSave = await fetch(`${origin}/api/data`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ data: document, baseRevision: 0 }),
    });
    assert.equal(staleSave.status, 409);

    const forcedSave = await fetch(`${origin}/api/data?force=1`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ data: document, baseRevision: 0 }),
    });
    assert.equal(forcedSave.status, 200);
    assert.equal((await forcedSave.json()).revision, 2);

    const openRegistration = await fetch(`${origin}/api/admin/registration`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ open: true }),
    });
    assert.equal(openRegistration.status, 200);
    const registerMember = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "member", displayName: "Member", password: "memberPass8" }),
    });
    assert.equal(registerMember.status, 201);
    const memberCookie = registerMember.headers.get("set-cookie").split(";")[0];
    const migration = await fetch(`${origin}/api/admin/migrate-owner-data`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ force: false }),
    });
    assert.equal(migration.status, 200);
    const invalidatedMemberSession = await fetch(`${origin}/api/data`, { headers: { Cookie: memberCookie, Origin: origin } });
    assert.equal(invalidatedMemberSession.status, 401);
    const memberLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "member", password: "memberPass8" }),
    });
    assert.equal(memberLogin.status, 200);
    const memberAuthHeaders = { Cookie: memberLogin.headers.get("set-cookie").split(";")[0], Origin: origin };
    const migratedData = await fetch(`${origin}/api/data`, { headers: memberAuthHeaders }).then((response) => response.json());
    assert.equal(migratedData.data.tasks[0].title, "迁移验证任务");
    const outlookStatus = await fetch(`${origin}/api/integrations/outlook/status`, { headers: memberAuthHeaders }).then((response) => response.json());
    assert.equal(outlookStatus.configured, false);
    assert.equal(outlookStatus.connected, false);
    const unavailableOutlook = await fetch(`${origin}/api/integrations/outlook/connect`, { method: "POST", headers: { ...memberAuthHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ source: "web" }) });
    assert.equal(unavailableOutlook.status, 503, "未配置 Microsoft 凭据时不能伪装为已经可连接");
    const googleStatus = await fetch(`${origin}/api/integrations/google/status`, { headers: memberAuthHeaders }).then((response) => response.json());
    assert.equal(googleStatus.configured, false);
    assert.equal(googleStatus.connected, false);
    const unavailableGoogle = await fetch(`${origin}/api/integrations/google/connect`, { method: "POST", headers: { ...memberAuthHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ source: "web" }) });
    assert.equal(unavailableGoogle.status, 503, "未配置 Google 凭据时不能伪装为已经可连接");
    const calendarSubscription = await fetch(`${origin}/api/calendar/subscription`, { method: "POST", headers: { ...memberAuthHeaders, "Content-Type": "application/json" }, body: "{}" }).then((response) => response.json());
    assert.match(calendarSubscription.url, /^http:\/\/127\.0\.0\.1:\d+\/calendar\/[A-Za-z0-9_-]+\.ics$/);
    const calendarFeed = await fetch(calendarSubscription.url);
    assert.equal(calendarFeed.status, 200);
    assert.match(calendarFeed.headers.get("content-type") || "", /text\/calendar/);
    assert.match(await calendarFeed.text(), /迁移验证任务/);
    const rotatedCalendar = await fetch(`${origin}/api/calendar/subscription`, { method: "POST", headers: { ...memberAuthHeaders, "Content-Type": "application/json" }, body: "{}" }).then((response) => response.json());
    assert.equal((await fetch(calendarSubscription.url)).status, 404, "重新生成后旧日历链接必须立即失效");
    assert.equal((await fetch(rotatedCalendar.url)).status, 200);
    const revokedCalendar = await fetch(`${origin}/api/calendar/subscription`, { method: "DELETE", headers: memberAuthHeaders });
    assert.equal(revokedCalendar.status, 200);
    assert.equal((await fetch(rotatedCalendar.url)).status, 404, "撤销后日历链接必须失效");
    const usersBeforeReset = await fetch(`${origin}/api/admin/users`, { headers: authHeaders }).then((response) => response.json());
    const member = usersBeforeReset.users.find((item) => item.username === "member");
    const resetPassword = await fetch(`${origin}/api/admin/users/${member.id}/reset-password`, { method: "POST", headers: authHeaders }).then((response) => response.json());
    assert.ok(resetPassword.temporaryPassword.length >= 10);
    const oldMemberPassword = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "member", password: "memberPass8" }),
    });
    assert.equal(oldMemberPassword.status, 401);
    const temporaryMemberLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "member", password: resetPassword.temporaryPassword }),
    });
    assert.equal(temporaryMemberLogin.status, 200);
    const ownerAfterMigration = await fetch(`${origin}/api/data`, { headers: authHeaders }).then((response) => response.json());
    assert.equal(ownerAfterMigration.data, null);
    const register = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "student_one", displayName: "测试同学", password: "student-password-123" }),
    });
    assert.equal(register.status, 201);
    const studentCookie = register.headers.get("set-cookie").split(";")[0];
    const studentHeaders = { Cookie: studentCookie, Origin: origin };
    const studentEmpty = await fetch(`${origin}/api/data`, { headers: studentHeaders }).then((response) => response.json());
    assert.equal(studentEmpty.revision, 0);
    assert.equal(studentEmpty.data, null);
    const forbiddenAdmin = await fetch(`${origin}/api/admin/users`, { headers: studentHeaders });
    assert.equal(forbiddenAdmin.status, 403);
    const users = await fetch(`${origin}/api/admin/users`, { headers: authHeaders }).then((response) => response.json());
    assert.equal(users.users.length, 3);
    assert.equal(users.migration.completed, true);
    assert.equal(users.stats.ordinary, 2);
    const student = users.users.find((item) => item.username === "student_one");
    const detail = await fetch(`${origin}/api/admin/users/${student.id}`, { headers: authHeaders }).then((response) => response.json());
    assert.equal(detail.user.counts.tasks, 0);
    const deleted = await fetch(`${origin}/api/admin/users/${student.id}`, { method: "DELETE", headers: authHeaders });
    assert.equal(deleted.status, 200);
    const deletedLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "student_one", password: "student-password-123" }),
    });
    assert.equal(deletedLogin.status, 401);

    const passwordChange = await fetch(`${origin}/api/auth/password`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "test-password-123", newPassword: "ownerNew" }),
    });
    assert.equal(passwordChange.status, 200);
    const oldPasswordLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "owner", password: "test-password-123" }),
    });
    assert.equal(oldPasswordLogin.status, 401);
    const newPasswordLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "owner", password: "ownerNew" }),
    });
    assert.equal(newPasswordLogin.status, 200);

    const privateFile = await fetch(`${origin}/data/fangcun.sqlite`);
    assert.equal(privateFile.status, 404);
    console.log("服务端检查通过：owner 到 member 迁移、密码重置、账号查看与删除、权限、会话和同步保护均正常。");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
  if (stderr.trim()) throw new Error(stderr);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
