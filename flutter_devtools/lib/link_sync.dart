import 'server_client.dart';
import 'wristband_contract.dart';

/// Native-independent orchestration for the phone -> server -> wristband path.
///
/// The server snapshot is fetched by Flutter over HTTPS. The final handoff is
/// a MethodChannel call, so removing the WebView does not remove data sync.
class LinkSyncCoordinator {
  LinkSyncCoordinator({required this.server, required this.wristband});

  final FangcunServerClient server;
  final WristbandClient wristband;

  Future<LinkSyncResult> syncLatestToWristband() async {
    final snapshot = await server.getLinkSnapshot();
    // XiaomiWristbandAdapter frames this JSON and the Vela app validates the
    // snapshot at the top level. Do not wrap the envelope a second time.
    final result = await wristband.sync(snapshot.raw);
    return LinkSyncResult(snapshot: snapshot, wristband: result);
  }
}

class LinkSyncResult {
  const LinkSyncResult({required this.snapshot, required this.wristband});

  final LinkSnapshot snapshot;
  final WristbandResult wristband;
}
