# 方寸 Flutter 开发者模式

这是路线图 Phase 9 的预备工程，不替换当前生产 Android 壳。它提供一套可独立运行的 Flutter UI，用来预览和主动触发超级岛、Focus、课程、DDL 与语义触感事件。

## 运行

```bash
export PATH="$PWD/../.tooling/flutter/bin:$PATH"
flutter pub get
flutter run
```

右下角悬浮窗中的事件会通过以下 MethodChannel 发给 Android 原生适配层：

```text
app.fangcun/hyperos
```

支持的方法：

```text
triggerEvent({ event, payload })
getCapabilities()
getSnapshot()
haptic({ semantic })
clearEvent()
setDeveloperMode({ enabled })
refreshWidget()
```

当前 Flutter 工程自带 Android 宿主实现；超级岛没有公开、可验证的通用 Android API，因此真实设备上使用高优先级通知作为回退，同时保留 `IslandManager` 接口供 HyperOS 专用适配接入。主 APK 的 Debug 包则使用同一事件模型的原生开发者悬浮窗。
