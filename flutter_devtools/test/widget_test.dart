import 'package:flutter_test/flutter_test.dart';

import 'package:fangcun_devtools/main.dart';

void main() {
  testWidgets('renders the Rust Server login form', (tester) async {
    await tester.pumpWidget(const FangcunDevToolsApp());

    expect(find.text('Flutter 最小客户端'), findsOneWidget);
    expect(find.text('Rust Server 地址'), findsOneWidget);
    expect(find.text('登录并读取数据'), findsOneWidget);
  });
}
