import 'dart:io';

import 'package:flutter/material.dart';

import 'server_client.dart';

const _ink = Color(0xFF101719);
const _panel = Color(0xFF182326);
const _teal = Color(0xFF8DEBDF);
const _muted = Color(0xFFA7BCB8);

String defaultServerUrl() {
  if (Platform.isAndroid) return 'http://10.0.2.2:4173';
  return 'http://127.0.0.1:4173';
}

void main() => runApp(const FangcunDevToolsApp());

class FangcunDevToolsApp extends StatelessWidget {
  const FangcunDevToolsApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(
      seedColor: _teal,
      brightness: Brightness.dark,
      surface: _panel,
    );
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: '方寸',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: scheme.copyWith(primary: _teal, secondary: _teal),
        scaffoldBackgroundColor: _ink,
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: _panel,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: Colors.white.withAlpha(18)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: _teal),
          ),
        ),
        useMaterial3: true,
      ),
      home: const FangcunHomePage(),
    );
  }
}

class FangcunHomePage extends StatefulWidget {
  const FangcunHomePage({super.key});

  @override
  State<FangcunHomePage> createState() => _FangcunHomePageState();
}

class _FangcunHomePageState extends State<FangcunHomePage> {
  final _serverController = TextEditingController(text: defaultServerUrl());
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  FangcunServerClient? _client;
  Map<String, dynamic> _document = <String, dynamic>{};
  Map<String, dynamic> _user = <String, dynamic>{};
  int _revision = 0;
  String? _updatedAt;
  String? _message;
  bool _busy = false;

  bool get _signedIn => _client?.isAuthenticated == true;

  @override
  void dispose() {
    _serverController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final baseUrl = Uri.tryParse(_serverController.text.trim());
    if (baseUrl == null ||
        !['http', 'https'].contains(baseUrl.scheme) ||
        baseUrl.host.isEmpty) {
      setState(() => _message = '请输入有效的 Rust Server 地址');
      return;
    }
    if (_usernameController.text.trim().isEmpty ||
        _passwordController.text.isEmpty) {
      setState(() => _message = '请输入用户名和密码');
      return;
    }
    setState(() {
      _busy = true;
      _message = '正在连接 Rust Server…';
    });
    final client = FangcunServerClient(baseUrl: baseUrl);
    try {
      final session = await client.login(
        _usernameController.text.trim(),
        _passwordController.text,
      );
      final remote = await client.getData();
      if (!mounted) return;
      setState(() {
        _client = client;
        _user = session.user;
        _setRemote(remote);
        _message = '已连接 Rust Server';
        _busy = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _message = _errorMessage(error);
      });
    }
  }

  Future<void> _refresh() async {
    final client = _client;
    if (client == null) return;
    setState(() {
      _busy = true;
      _message = '正在读取最新数据…';
    });
    try {
      final remote = await client.getData();
      if (!mounted) return;
      setState(() {
        _setRemote(remote);
        _message = '数据已刷新';
        _busy = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _message = _errorMessage(error);
      });
    }
  }

  Future<void> _toggleTask(int index, bool completed) async {
    final client = _client;
    if (client == null) return;
    final tasks = _tasks
        .map((task) => Map<String, dynamic>.from(task))
        .toList();
    if (index >= tasks.length) return;
    tasks[index]['completed'] = completed;
    tasks[index]['updatedAt'] = DateTime.now().toUtc().toIso8601String();
    final next = _copyDocument()..['tasks'] = tasks;
    setState(() {
      _document = next;
      _message = completed ? '已在本地标记完成，正在写入服务器…' : '正在恢复任务…';
    });
    try {
      final result = await client.putData(next, _revision);
      if (!mounted) return;
      setState(() {
        _revision = result.revision;
        _updatedAt = result.updatedAt;
        _message = '已同步到 Rust Server · revision $_revision';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _message = _errorMessage(error));
      if (error is RevisionConflictException) await _refresh();
    }
  }

  Future<void> _addTask() async {
    final title = await showDialog<String>(
      context: context,
      builder: (context) => const _AddTaskDialog(),
    );
    if (!mounted || title == null || title.trim().isEmpty) return;
    final client = _client;
    if (client == null) return;
    final tasks = _tasks
        .map((task) => Map<String, dynamic>.from(task))
        .toList();
    final timestamp = DateTime.now().toUtc().toIso8601String();
    tasks.insert(0, {
      'id': 'flutter-${DateTime.now().microsecondsSinceEpoch}',
      'title': title.trim(),
      'completed': false,
      'important': false,
      'urgent': false,
      'createdAt': timestamp,
      'updatedAt': timestamp,
    });
    final next = _copyDocument()..['tasks'] = tasks;
    setState(() {
      _busy = true;
      _document = next;
      _message = '正在创建任务…';
    });
    try {
      final result = await client.putData(next, _revision);
      if (!mounted) return;
      setState(() {
        _revision = result.revision;
        _updatedAt = result.updatedAt;
        _busy = false;
        _message = '任务已创建并同步';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _message = _errorMessage(error);
      });
      if (error is RevisionConflictException) await _refresh();
    }
  }

  Future<void> _logout() async {
    final client = _client;
    if (client != null) await client.logout();
    if (!mounted) return;
    setState(() {
      _client = null;
      _document = <String, dynamic>{};
      _user = <String, dynamic>{};
      _revision = 0;
      _updatedAt = null;
      _message = '已退出登录';
    });
  }

  void _setRemote(DataSnapshot remote) {
    final raw = remote.data;
    _document = raw is Map
        ? Map<String, dynamic>.from(raw)
        : <String, dynamic>{};
    if (_document['tasks'] is! List) _document['tasks'] = <dynamic>[];
    _revision = remote.revision;
    _updatedAt = remote.updatedAt;
  }

  Map<String, dynamic> _copyDocument() => Map<String, dynamic>.from(_document);

  List<Map<String, dynamic>> get _tasks {
    final raw = _document['tasks'];
    if (raw is! List) return <Map<String, dynamic>>[];
    return raw
        .whereType<Map>()
        .map((task) => Map<String, dynamic>.from(task))
        .toList();
  }

  String _errorMessage(Object error) {
    if (error is FangcunApiException) return error.message;
    if (error is SocketException) return '无法连接 Rust Server：${error.message}';
    return '请求失败：$error';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: _signedIn ? _buildTasksPage() : _buildLoginPage(),
        ),
      ),
      floatingActionButton: _signedIn
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : _addTask,
              icon: const Icon(Icons.add),
              label: const Text('新任务'),
            )
          : null,
    );
  }

  Widget _buildLoginPage() {
    return Center(
      key: const ValueKey('login'),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.stars_rounded, color: _teal, size: 48),
              const SizedBox(height: 16),
              const Text(
                '方寸',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                'Flutter 最小客户端',
                textAlign: TextAlign.center,
                style: TextStyle(color: _muted.withAlpha(220)),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _serverController,
                decoration: const InputDecoration(
                  labelText: 'Rust Server 地址',
                  hintText: 'http://10.0.2.2:4173',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _usernameController,
                decoration: const InputDecoration(labelText: '用户名'),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                decoration: const InputDecoration(labelText: '密码'),
                obscureText: true,
                onSubmitted: (_) => _busy ? null : _login(),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: _busy ? null : _login,
                icon: const Icon(Icons.login),
                label: Text(_busy ? '连接中…' : '登录并读取数据'),
              ),
              if (_message != null) ...[
                const SizedBox(height: 16),
                _StatusLine(message: _message!, busy: _busy),
              ],
              const SizedBox(height: 18),
              Text(
                '默认地址适用于 Android 模拟器。真机请填写 Rust Server 的局域网或 HTTPS 地址。',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _muted.withAlpha(180),
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTasksPage() {
    final pending = _tasks.where((task) => task['completed'] != true).length;
    final name = _user['displayName'] ?? _user['username'] ?? '方寸用户';
    final updatedLabel = _updatedAt == null
        ? 'Rust Server 数据'
        : '服务器更新：$_updatedAt';
    return RefreshIndicator(
      key: const ValueKey('tasks'),
      onRefresh: _refresh,
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            sliver: SliverToBoxAdapter(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '你好，$name',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '今天先完成最重要的一件事。',
                          style: TextStyle(color: _muted.withAlpha(220)),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _busy ? null : _refresh,
                    tooltip: '刷新',
                    icon: const Icon(Icons.refresh),
                  ),
                  IconButton(
                    onPressed: _busy ? null : _logout,
                    tooltip: '退出',
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: [
                  Expanded(
                    child: _MetricCard(
                      label: '待完成',
                      value: '$pending',
                      icon: Icons.radio_button_unchecked,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _MetricCard(
                      label: '版本',
                      value: '$_revision',
                      icon: Icons.cloud_done_outlined,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_message != null)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
              sliver: SliverToBoxAdapter(
                child: _StatusLine(message: _message!, busy: _busy),
              ),
            ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
            sliver: SliverToBoxAdapter(
              child: Text(
                updatedLabel,
                style: TextStyle(color: _muted.withAlpha(180), fontSize: 11),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 120),
            sliver: _tasks.isEmpty
                ? SliverToBoxAdapter(child: _EmptyTasks(onAdd: _addTask))
                : SliverList.separated(
                    itemCount: _tasks.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final task = _tasks[index];
                      final completed = task['completed'] == true;
                      return _TaskTile(
                        task: task,
                        completed: completed,
                        onChanged: _busy
                            ? null
                            : (value) => _toggleTask(index, value ?? false),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
  });
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Card(
    color: _panel,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Icon(icon, color: _teal),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                label,
                style: TextStyle(color: _muted.withAlpha(210), fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({
    required this.task,
    required this.completed,
    required this.onChanged,
  });
  final Map<String, dynamic> task;
  final bool completed;
  final ValueChanged<bool?>? onChanged;

  @override
  Widget build(BuildContext context) {
    final title = task['title']?.toString().trim();
    final due = task['due']?.toString().trim();
    return Card(
      color: _panel,
      child: CheckboxListTile(
        value: completed,
        onChanged: onChanged,
        controlAffinity: ListTileControlAffinity.leading,
        title: Text(
          title == null || title.isEmpty ? '未命名任务' : title,
          style: TextStyle(
            decoration: completed ? TextDecoration.lineThrough : null,
            color: completed ? _muted : null,
          ),
        ),
        subtitle: due == null || due.isEmpty ? null : Text(due),
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.message, required this.busy});
  final String message;
  final bool busy;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      if (busy) ...[
        const SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2, color: _teal),
        ),
        const SizedBox(width: 8),
      ],
      Flexible(
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: TextStyle(color: _muted.withAlpha(220), fontSize: 12),
        ),
      ),
    ],
  );
}

class _EmptyTasks extends StatelessWidget {
  const _EmptyTasks({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Card(
    color: _panel,
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        children: [
          const Icon(Icons.inbox_outlined, color: _teal, size: 36),
          const SizedBox(height: 12),
          const Text('服务器还没有任务'),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: const Text('创建第一项'),
          ),
        ],
      ),
    ),
  );
}

class _AddTaskDialog extends StatefulWidget {
  const _AddTaskDialog();

  @override
  State<_AddTaskDialog> createState() => _AddTaskDialogState();
}

class _AddTaskDialogState extends State<_AddTaskDialog> {
  final controller = TextEditingController();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('新任务'),
    content: TextField(
      controller: controller,
      autofocus: true,
      decoration: const InputDecoration(labelText: '任务名称'),
      onSubmitted: (value) => Navigator.of(context).pop(value),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('取消'),
      ),
      FilledButton(
        onPressed: () => Navigator.of(context).pop(controller.text),
        child: const Text('创建'),
      ),
    ],
  );
}
