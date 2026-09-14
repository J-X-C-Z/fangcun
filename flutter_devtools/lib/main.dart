import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

const _ink = Color(0xFF0D1217);
const _panel = Color(0xFF151E25);
const _teal = Color(0xFF8DEBDF);
const _amber = Color(0xFFFFC978);
const _text = Color(0xFFE8F5F1);
const _muted = Color(0xFF9AB5B1);

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
      title: '方寸开发者模式',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: scheme.copyWith(primary: _teal, secondary: _amber),
        scaffoldBackgroundColor: _ink,
        useMaterial3: true,
      ),
      home: const DeveloperConsolePage(),
    );
  }
}

class NativeEventClient {
  static const _channel = MethodChannel('app.fangcun/hyperos');

  Future<Map<String, dynamic>> call(String method, [Map<String, dynamic>? arguments]) async {
    try {
      final result = await _channel.invokeMethod<dynamic>(method, arguments);
      if (result is Map) {
        return Map<String, dynamic>.from(
          result.map((key, value) => MapEntry(key.toString(), value)),
        );
      }
      // Widget tests and a host without a registered handler can both return
      // null. Treat that the same as a missing native module.
      return {'ok': false, 'simulated': true, 'message': 'Native Module 尚未嵌入，当前为 Flutter 模拟回显'};
    } on MissingPluginException {
      return {'ok': false, 'simulated': true, 'message': 'Native Module 尚未嵌入，当前为 Flutter 模拟回显'};
    } catch (error) {
      return {'ok': false, 'message': error.toString()};
    }
  }
}

class EventSpec {
  const EventSpec(this.event, this.label, this.icon, this.color);

  final String event;
  final String label;
  final IconData icon;
  final Color color;
}

const _eventSpecs = [
  EventSpec('focus.start', 'Focus 开始', Icons.play_arrow_rounded, _teal),
  EventSpec('focus.pause', 'Focus 暂停', Icons.pause_rounded, _amber),
  EventSpec('focus.complete', 'Focus 完成', Icons.check_rounded, Color(0xFF9FE6A0)),
  EventSpec('course.start', '课程开始', Icons.school_rounded, Color(0xFFA8C7FF)),
  EventSpec('ddl.remind', 'DDL 提醒', Icons.notifications_active_rounded, Color(0xFFFF9F9F)),
];

class DeveloperConsolePage extends StatefulWidget {
  const DeveloperConsolePage({super.key});

  @override
  State<DeveloperConsolePage> createState() => _DeveloperConsolePageState();
}

class _DeveloperConsolePageState extends State<DeveloperConsolePage> {
  final _native = NativeEventClient();
  final _history = <String>[];
  EventSpec _active = _eventSpecs.first;
  String _status = '等待触发';
  Map<String, dynamic> _capabilities = const {};
  bool _expanded = true;
  Offset _dragOffset = Offset.zero;
  bool _busy = false;

  Future<void> _trigger(EventSpec spec) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _active = spec;
      _status = '正在发送 ${spec.event}';
    });
    final result = await _native.call('triggerEvent', {
      'event': spec.event,
      'payload': {
        'title': spec.event.startsWith('focus') ? 'C++训练' : spec.event == 'course.start' ? '大学物理实验' : '实验报告',
        'progress': '43 / 60 min',
        'time': '14:30 - 16:30',
        'due': '今天 23:59',
      },
    });
    if (!mounted) return;
    final simulated = result['simulated'] == true;
    setState(() {
      _busy = false;
      _status = simulated ? 'Flutter 模拟回显 · ${spec.event}' : 'Native Module 已响应 · ${spec.event}';
      _history.insert(0, '${_time()}  ${spec.event}');
      if (_history.length > 6) _history.removeLast();
    });
  }

  Future<void> _loadCapabilities() async {
    final result = await _native.call('getCapabilities');
    if (!mounted) return;
    setState(() {
      _capabilities = result;
      _status = result['simulated'] == true ? '能力检测处于模拟模式' : '设备能力已读取';
    });
  }

  Future<void> _playHaptic(String semantic) async {
    await _native.call('haptic', {'semantic': semantic});
    if (!mounted) return;
    setState(() {
      _status = '触感 · $semantic';
      _history.insert(0, '${_time()}  haptic.$semantic');
      if (_history.length > 6) _history.removeLast();
    });
  }

  String _time() {
    final now = DateTime.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: CustomPaint(painter: _GridPainter())),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 170),
              child: _buildStage(context),
            ),
          ),
          _buildFloatingConsole(context),
        ],
      ),
    );
  }

  Widget _buildStage(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('方寸 / 实验台', style: TextStyle(color: _teal.withValues(alpha: .8), fontSize: 12, letterSpacing: 1.2)),
                  const SizedBox(height: 8),
                  const Text('原生事件预览', style: TextStyle(color: _text, fontSize: 30, fontWeight: FontWeight.w700, height: 1.05)),
                  const SizedBox(height: 8),
                  Text('为超级岛、小部件和触感准备的可控现场。', style: TextStyle(color: _muted.withValues(alpha: .9), fontSize: 14)),
                ],
              ),
            ),
            _statusPill('DEBUG', _amber),
          ],
        ),
        const SizedBox(height: 28),
        _buildIslandStage(),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _metric('通道', 'app.fangcun/hyperos', Icons.account_tree_rounded)),
            const SizedBox(width: 10),
            Expanded(child: _metric('事件', _active.event, Icons.bolt_rounded)),
          ],
        ),
        const SizedBox(height: 16),
        _buildCapabilities(),
      ],
    );
  }

  Widget _buildIslandStage() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: _panel.withValues(alpha: .88),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: _teal.withValues(alpha: .12)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .24), blurRadius: 24, offset: const Offset(0, 14))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.waves_rounded, color: _teal.withValues(alpha: .85), size: 17),
              const SizedBox(width: 7),
              Text('SUPER ISLAND / FALLBACK PREVIEW', style: TextStyle(color: _muted, fontSize: 10, letterSpacing: 1.1)),
            ],
          ),
          const SizedBox(height: 18),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 280),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeIn,
            child: _islandCapsule(key: ValueKey(_active.event)),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: Text(_status, style: TextStyle(color: _active.color, fontSize: 12))),
              if (_busy) const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: _teal)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _islandCapsule({required Key key}) {
    final focus = _active.event.startsWith('focus');
    final title = focus ? 'C++训练' : _active.event == 'course.start' ? '大学物理实验' : '实验报告';
    final subtitle = focus ? '43 / 60 min' : _active.event == 'course.start' ? '14:30 - 16:30  ·  剩余 47 分钟' : '今天 23:59';
    return Container(
      key: key,
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      decoration: BoxDecoration(
        color: _ink,
        borderRadius: BorderRadius.circular(23),
        border: Border.all(color: _active.color.withValues(alpha: .5)),
        boxShadow: [BoxShadow(color: _active.color.withValues(alpha: .12), blurRadius: 18)],
      ),
      child: Row(
        children: [
          Container(
            width: 35,
            height: 35,
            decoration: BoxDecoration(color: _active.color.withValues(alpha: .14), shape: BoxShape.circle),
            child: Icon(_active.icon, color: _active.color, size: 20),
          ),
          const SizedBox(width: 11),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(color: _text, fontWeight: FontWeight.w700, fontSize: 15)), const SizedBox(height: 3), Text(subtitle, style: TextStyle(color: _muted, fontSize: 12))])),
          if (focus) SizedBox(width: 38, height: 38, child: CircularProgressIndicator(value: .72, strokeWidth: 3, color: _active.color, backgroundColor: _active.color.withValues(alpha: .14))),
        ],
      ),
    );
  }

  Widget _buildCapabilities() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: _panel.withValues(alpha: .68), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withValues(alpha: .06))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [const Expanded(child: Text('设备能力', style: TextStyle(color: _text, fontWeight: FontWeight.w700))), TextButton(onPressed: _loadCapabilities, child: const Text('读取'))]),
        Text(_capabilities.isEmpty ? '尚未读取；点击右下角面板中的“能力检测”。' : _capabilities.toString(), style: TextStyle(color: _muted, fontSize: 11, height: 1.45)),
      ]),
    );
  }

  Widget _buildFloatingConsole(BuildContext context) {
    if (!_expanded) {
      return Positioned(
        right: 18 - _dragOffset.dx,
        bottom: 24 - _dragOffset.dy,
        child: GestureDetector(
          onPanUpdate: (details) => setState(() => _dragOffset += details.delta),
          child: _devBubble(),
        ),
      );
    }
    return Positioned(
      left: 16,
      right: 16,
      bottom: 16,
      child: Transform.translate(offset: _dragOffset, child: _consolePanel()),
    );
  }

  Widget _devBubble() {
    return Container(
      width: 62,
      height: 52,
      decoration: BoxDecoration(color: _panel, borderRadius: BorderRadius.circular(19), border: Border.all(color: _teal.withValues(alpha: .4)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .3), blurRadius: 20)]),
      child: InkWell(onTap: () => setState(() => _expanded = true), borderRadius: BorderRadius.circular(19), child: const Center(child: Text('DEV', style: TextStyle(color: _teal, fontWeight: FontWeight.w800, letterSpacing: 1.2)))),
    );
  }

  Widget _consolePanel() {
    return Container(
      constraints: const BoxConstraints(maxHeight: 430),
      padding: const EdgeInsets.fromLTRB(16, 13, 16, 16),
      decoration: BoxDecoration(color: _panel.withValues(alpha: .98), borderRadius: BorderRadius.circular(25), border: Border.all(color: _teal.withValues(alpha: .22)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .42), blurRadius: 30, offset: const Offset(0, 12))]),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          GestureDetector(
            onPanUpdate: (details) => setState(() => _dragOffset += details.delta),
            child: Row(children: [
              Container(width: 8, height: 8, decoration: const BoxDecoration(color: _amber, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              const Expanded(child: Text('开发者模式', style: TextStyle(color: _text, fontWeight: FontWeight.w800, fontSize: 16))),
              TextButton(onPressed: () => setState(() => _expanded = false), child: const Text('收起')),
            ]),
          ),
          Text('主动触发原生事件 · 拖动标题移动悬浮窗', style: TextStyle(color: _muted, fontSize: 11)),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: _eventSpecs.map(_eventButton).toList()),
          const SizedBox(height: 14),
          Text('语义触感', style: TextStyle(color: _muted, fontSize: 11)),
          const SizedBox(height: 7),
          Wrap(spacing: 7, children: ['light', 'snap', 'confirm', 'success'].map((semantic) => _smallAction(semantic, () => _playHaptic(semantic))).toList()),
          const SizedBox(height: 12),
          Row(children: [Expanded(child: _smallAction('能力检测', _loadCapabilities)), const SizedBox(width: 8), Expanded(child: _smallAction('清除预览', () async { await _native.call('clearEvent'); if (mounted) setState(() => _status = '预览已清除'); }))]),
          if (_history.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_history.join('\n'), style: TextStyle(color: _muted, fontSize: 10, height: 1.55)),
          ],
        ]),
      ),
    );
  }

  Widget _eventButton(EventSpec spec) {
    return SizedBox(
      height: 38,
      child: FilledButton.tonalIcon(
        onPressed: () => _trigger(spec),
        icon: Icon(spec.icon, size: 16),
        label: Text(spec.label, style: const TextStyle(fontSize: 11)),
        style: FilledButton.styleFrom(foregroundColor: spec.color, backgroundColor: spec.color.withValues(alpha: .11), padding: const EdgeInsets.symmetric(horizontal: 10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      ),
    );
  }

  Widget _smallAction(String label, VoidCallback action) {
    return SizedBox(height: 34, child: OutlinedButton(onPressed: action, style: OutlinedButton.styleFrom(foregroundColor: _muted, side: BorderSide(color: Colors.white.withValues(alpha: .12)), padding: const EdgeInsets.symmetric(horizontal: 11), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11))), child: Text(label, style: const TextStyle(fontSize: 11))));
  }

  Widget _metric(String title, String value, IconData icon) => Container(padding: const EdgeInsets.all(13), decoration: BoxDecoration(color: _panel.withValues(alpha: .68), borderRadius: BorderRadius.circular(17)), child: Row(children: [Icon(icon, color: _teal.withValues(alpha: .75), size: 17), const SizedBox(width: 9), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: TextStyle(color: _muted, fontSize: 10)), const SizedBox(height: 3), Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: _text, fontSize: 11, fontWeight: FontWeight.w600))]))]));

  Widget _statusPill(String text, Color color) => Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7), decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withValues(alpha: .3))), child: Text(text, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.1)));
}

class _GridPainter extends CustomPainter {
  const _GridPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: .025)..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 32) { canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint); }
    for (double y = 0; y < size.height; y += 32) { canvas.drawLine(Offset(0, y), Offset(size.width, y), paint); }
    final glow = Paint()..shader = RadialGradient(colors: [_teal.withValues(alpha: .09), Colors.transparent]).createShader(Rect.fromCircle(center: Offset(size.width * .78, size.height * .16), radius: size.width * .72));
    canvas.drawCircle(Offset(size.width * .78, size.height * .16), size.width * .72, glow);
  }

  @override
  bool shouldRepaint(covariant _GridPainter oldDelegate) => false;
}
