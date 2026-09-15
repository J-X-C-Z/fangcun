package app.fangcun;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.xiaomi.xms.wearable.Wearable;
import com.xiaomi.xms.wearable.auth.AuthApi;
import com.xiaomi.xms.wearable.auth.Permission;
import com.xiaomi.xms.wearable.message.MessageApi;
import com.xiaomi.xms.wearable.message.OnMessageReceivedListener;
import com.xiaomi.xms.wearable.node.DataItem;
import com.xiaomi.xms.wearable.node.Node;
import com.xiaomi.xms.wearable.node.NodeApi;
import com.xiaomi.xms.wearable.node.OnDataChangedListener;
import com.xiaomi.xms.wearable.node.DataSubscribeResult;
import com.xiaomi.xms.wearable.service.OnServiceConnectionListener;
import com.xiaomi.xms.wearable.service.ServiceApi;
import com.xiaomi.xms.wearable.tasks.Task;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Xiaomi Wearable AAR adapter for the Fangcun phone-to-Vela protocol. */
public final class XiaomiWristbandAdapter implements WristbandAdapter {
    private static final String LINK_TAG = "fangcun.link.v1";
    private static final String ACK_TAG = "fangcun.link.ack";
    private static final String DEFAULT_WEAR_PACKAGE = "app.fangcun";
    // Leave room for the JSON envelope; large Vela messages are unreliable on
    // some community-tested firmware versions.
    private static final int MAX_FRAME_BYTES = 2200;
    private static final int MAX_RETRIES = 3;
    private static final long ACK_TIMEOUT_MS = 2500L;
    private static final long CONNECT_TIMEOUT_MS = 3500L;
    private static final long[] RECONNECT_DELAYS_MS = {1000L, 2000L, 4000L, 8000L, 16000L};

    private final NodeApi nodeApi;
    private final AuthApi authApi;
    private final MessageApi messageApi;
    private final ServiceApi serviceApi;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Object transferLock = new Object();
    private final OnMessageReceivedListener messageListener = this::onMessage;
    private final OnDataChangedListener connectionListener = this::onConnectionChanged;
    private final OnServiceConnectionListener serviceListener = new OnServiceConnectionListener() {
        @Override public void onServiceConnected() { serviceConnectionStatus = "connected"; }
        @Override public void onServiceDisconnected() { serviceConnectionStatus = "disconnected"; }
    };

    private volatile Node activeNode;
    private volatile String state = STATE_DISCONNECTED;
    private volatile String lastRevision;
    private volatile PendingAck pendingAck;
    private volatile boolean listenersRegistered;
    private volatile boolean heartbeatRunning;
    private volatile boolean handshakeComplete;
    private volatile String lastError;
    private volatile int lastNodeCount;
    private volatile Boolean lastWearAppInstalled;
    private volatile Boolean lastPermissionsGranted;
    private volatile String serviceConnectionStatus = "unknown";
    private int reconnectAttempt;

    public XiaomiWristbandAdapter(Context context) {
        Context appContext = context.getApplicationContext();
        nodeApi = Wearable.getNodeApi(appContext);
        authApi = Wearable.getAuthApi(appContext);
        messageApi = Wearable.getMessageApi(appContext);
        serviceApi = Wearable.getServiceApi(appContext);
        serviceApi.registerServiceConnectionListener(serviceListener);
    }

    @Override
    public JSONObject capabilities() {
        JSONObject result = base();
        try {
            result.put("available", true)
                .put("state", state)
                .put("adapter", "xiaomi-wearable-aar")
                .put("transport", "xiaomi-wearable")
                .put("supportedTransports", new String[]{"xiaomi-wearable"})
                .put("requiresPermissions", new String[]{"DEVICE_MANAGER", "NOTIFY"})
                .put("wearAppPackage", DEFAULT_WEAR_PACKAGE)
                .put("features", new JSONObject()
                    .put("nodeDiscovery", true)
                    .put("permissions", true)
                    .put("openWearApp", true)
                    .put("messageApi", true)
                    .put("handshake", true)
                    .put("heartbeat", true)
                    .put("chunking", true)
                    .put("ack", true));
        } catch (Exception ignored) {}
        return result;
    }

    @Override
    public JSONObject status() {
        JSONObject result = capabilities();
        try {
            Node node = activeNode;
            result.put("nodeId", node == null ? JSONObject.NULL : node.id)
                .put("nodeName", node == null ? JSONObject.NULL : node.name)
                .put("listenersRegistered", listenersRegistered)
                .put("lastRevision", lastRevision == null ? JSONObject.NULL : lastRevision)
                .put("lastError", lastError == null ? JSONObject.NULL : lastError)
                .put("nodeCount", lastNodeCount)
                .put("wearAppInstalled", lastWearAppInstalled == null ? JSONObject.NULL : lastWearAppInstalled)
                .put("permissionsGranted", lastPermissionsGranted == null ? JSONObject.NULL : lastPermissionsGranted);
            result.put("serviceConnection", serviceConnectionStatus);
        } catch (Exception ignored) {}
        return result;
    }

    @Override
    public JSONObject connect(JSONObject options) {
        CountDownLatch done = new CountDownLatch(1);
        discoverAndPrepare(true, done);
        await(done, CONNECT_TIMEOUT_MS);
        return operationResult("connect", STATE_CONNECTED.equals(state) && activeNode != null);
    }

    @Override
    public JSONObject disconnect() {
        Node node = activeNode;
        if (node != null) unregister(node);
        activeNode = null;
        listenersRegistered = false;
        heartbeatRunning = false;
        handshakeComplete = false;
        state = STATE_DISCONNECTED;
        return operationResult("disconnect", true);
    }

    @Override
    public JSONObject openApp(JSONObject options) {
        Node node = activeNode;
        if (node == null) {
            CountDownLatch ready = new CountDownLatch(1);
            discoverAndPrepare(false, ready);
            await(ready, CONNECT_TIMEOUT_MS);
            node = activeNode;
        }
        if (node == null) return operationResult("openApp", false, "not_connected");
        // launchWearApp's second argument is the RPK package name, not a
        // Vela page route. The AAR/API contract uses this to select the app.
        String packageName = options == null ? DEFAULT_WEAR_PACKAGE : options.optString("package", DEFAULT_WEAR_PACKAGE);
        if (packageName.isEmpty()) packageName = DEFAULT_WEAR_PACKAGE;
        try {
            boolean launched = awaitTask(nodeApi.launchWearApp(node.id, packageName), CONNECT_TIMEOUT_MS);
            lastError = launched ? null : "launch_failed";
            return operationResult("openApp", launched, launched ? null : "launch_failed");
        } catch (Exception error) {
            lastError = "launch_failed";
            return operationResult("openApp", false, "launch_failed");
        }
    }

    @Override
    public JSONObject sync(JSONObject payload) {
        Node node = activeNode;
        if (node == null || !listenersRegistered) {
            CountDownLatch ready = new CountDownLatch(1);
            discoverAndPrepare(false, ready);
            await(ready, CONNECT_TIMEOUT_MS);
            node = activeNode;
        }
        if (node == null || !listenersRegistered) return operationResult("sync", false, "not_connected");

        String data = payload == null ? "{}" : payload.toString();
        String transferId = UUID.randomUUID().toString();
        byte[][] frames = buildFrames(data, transferId);
        synchronized (transferLock) {
            if (!handshakeComplete
                && !sendTransfer(node.id, "{\"type\":\"handshake\",\"protocol\":\"fangcun.link.v1\"}", true)) {
                return operationResult("sync", false, "handshake_failed");
            }
            handshakeComplete = true;
            for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                PendingAck ack = new PendingAck(transferId);
                pendingAck = ack;
                boolean sent = sendFrames(node.id, frames);
                boolean acknowledged = sent && ack.await(ACK_TIMEOUT_MS);
                pendingAck = null;
                if (acknowledged && ack.ok) {
                    lastRevision = ack.revision;
                    JSONObject result = operationResult("sync", true);
                    try {
                        result.put("transferId", transferId).put("attempts", attempt)
                            .put("revision", ack.revision == null ? JSONObject.NULL : ack.revision);
                    } catch (Exception ignored) {}
                    return result;
                }
            }
        }
        return operationResult("sync", false, "ack_timeout");
    }

    private void discoverAndPrepare(boolean requestPermission, CountDownLatch done) {
        state = STATE_CONNECTING;
        lastError = null;
        lastNodeCount = 0;
        lastWearAppInstalled = null;
        lastPermissionsGranted = null;
        nodeApi.getConnectedNodes()
            .addOnSuccessListener(nodes -> {
                lastNodeCount = nodes == null ? 0 : nodes.size();
                chooseNode(nodes, requestPermission, done);
            })
            .addOnFailureListener(error -> {
                state = STATE_ERROR;
                lastError = "sdk_discovery_failed";
                finishDiscovery(done);
            });
    }

    private void chooseNode(List<Node> nodes, boolean requestPermission, CountDownLatch done) {
        Node node = nodes == null || nodes.isEmpty() ? null : nodes.get(0);
        if (node == null) {
            Node previous = activeNode;
            if (previous != null) unregister(previous);
            activeNode = null;
            handshakeComplete = false;
            state = STATE_DISCONNECTED;
            lastError = "connected".equals(serviceConnectionStatus) ? "service_connected_no_node"
                : "disconnected".equals(serviceConnectionStatus) ? "wearable_service_disconnected"
                : "no_connected_node";
            finishDiscovery(done);
            return;
        }
        Node previous = activeNode;
        if (previous != null && !previous.id.equals(node.id)) unregister(previous);
        activeNode = node;
        nodeApi.isWearAppInstalled(node.id)
            .addOnSuccessListener(installed -> {
                lastWearAppInstalled = installed;
                if (!installed) {
                    state = STATE_ERROR;
                    lastError = "wear_app_not_installed";
                    finishDiscovery(done);
                    return;
                }
                checkPermissions(node, requestPermission, done);
            })
            .addOnFailureListener(error -> {
                // The AAR exposes this as a Task<Boolean>, but a failed Task is
                // not equivalent to Boolean.FALSE.  In particular, Band 10 Pro
                // can have a connected node while this optional query is not
                // supported by the companion service.  Only the SDK's explicit
                // AppNotInstalledException is evidence that the app is absent;
                // otherwise keep the value unknown and continue with the
                // permission/message setup, which is the actual connection path.
                if (isAppNotInstalledFailure(error)) {
                    lastWearAppInstalled = false;
                    state = STATE_ERROR;
                    lastError = "wear_app_not_installed";
                    finishDiscovery(done);
                } else {
                    lastWearAppInstalled = null;
                    lastError = "wear_app_check_unavailable";
                    checkPermissions(node, requestPermission, done);
                }
            });
    }

    private static boolean isAppNotInstalledFailure(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if ("com.xiaomi.xms.wearable.exception.AppNotInstalledException"
                .equals(current.getClass().getName())) return true;
        }
        return false;
    }

    private void checkPermissions(Node node, boolean requestPermission, CountDownLatch done) {
        Permission[] required = new Permission[]{Permission.DEVICE_MANAGER, Permission.NOTIFY};
        authApi.checkPermissions(node.id, required)
            .addOnSuccessListener(granted -> {
                boolean allGranted = granted != null && granted.length == required.length;
                if (allGranted) for (boolean value : granted) allGranted &= value;
                lastPermissionsGranted = allGranted;
                if (allGranted) register(node, done);
                else if (requestPermission) {
                    authApi.requestPermission(node.id, required)
                        .addOnSuccessListener(permissions -> {
                            boolean approved = permissions != null;
                            for (Permission permission : required) {
                                boolean found = false;
                                if (permissions != null) for (Permission grantedPermission : permissions) {
                                    if (permission == grantedPermission) { found = true; break; }
                                }
                                approved &= found;
                            }
                            lastPermissionsGranted = approved;
                            if (approved) register(node, done);
                            else {
                                state = STATE_ERROR;
                                lastError = "permission_denied";
                                finishDiscovery(done);
                            }
                        })
                        .addOnFailureListener(error -> {
                            state = STATE_ERROR;
                            lastError = "permission_denied";
                            finishDiscovery(done);
                        });
                } else {
                    state = STATE_DISCONNECTED;
                    lastError = "permission_required";
                    finishDiscovery(done);
                }
            })
            .addOnFailureListener(error -> {
                state = STATE_ERROR;
                lastError = "permission_check_failed";
                finishDiscovery(done);
            });
    }

    private void register(Node node, CountDownLatch done) {
        if (listenersRegistered) { state = STATE_CONNECTED; startHeartbeat(); finishDiscovery(done); return; }
        messageApi.addListener(node.id, messageListener)
            .addOnSuccessListener(ignored -> nodeApi.subscribe(node.id, DataItem.ITEM_CONNECTION, connectionListener)
                .addOnSuccessListener(ignored2 -> {
                    listenersRegistered = true;
                        state = STATE_CONNECTED;
                        lastError = null;
                        reconnectAttempt = 0;
                        handshakeComplete = false;
                        startHeartbeat();
                        startHandshake(node);
                        finishDiscovery(done);
                })
                .addOnFailureListener(error -> {
                    state = STATE_ERROR;
                    lastError = "connection_subscription_failed";
                    finishDiscovery(done);
                }))
            .addOnFailureListener(error -> {
                state = STATE_ERROR;
                lastError = "message_listener_failed";
                finishDiscovery(done);
            });
    }

    private void startHeartbeat() {
        if (heartbeatRunning) return;
        heartbeatRunning = true;
        worker.scheduleWithFixedDelay(() -> {
            Node node = activeNode;
            if (!heartbeatRunning || node == null || !listenersRegistered) return;
            synchronized (transferLock) { sendTransfer(node.id, "{\"type\":\"heartbeat\"}", true); }
        }, 15, 15, TimeUnit.SECONDS);
    }

    private void startHandshake(Node node) {
        worker.execute(() -> {
            synchronized (transferLock) {
                boolean ok = sendTransfer(node.id, "{\"type\":\"handshake\",\"protocol\":\"fangcun.link.v1\"}", true);
                if (ok) handshakeComplete = true;
                if (!ok && activeNode != null && activeNode.id.equals(node.id)) scheduleReconnect();
            }
        });
    }

    private void onConnectionChanged(String nodeId, DataItem item, DataSubscribeResult result) {
        Node node = activeNode;
        if (node == null || !node.id.equals(nodeId)) return;
        if (result != null && result.getConnectedStatus() == DataSubscribeResult.RESULT_CONNECTION_CONNECTED) {
            state = STATE_CONNECTED;
            reconnectAttempt = 0;
        } else {
            state = STATE_DISCONNECTED;
            listenersRegistered = false;
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        int attempt = Math.min(reconnectAttempt++, RECONNECT_DELAYS_MS.length - 1);
        mainHandler.postDelayed(() -> discoverAndPrepare(false, null), RECONNECT_DELAYS_MS[attempt]);
    }

    private void onMessage(String nodeId, byte[] bytes) {
        Node node = activeNode;
        if (node == null || !node.id.equals(nodeId) || bytes == null) return;
        try {
            JSONObject message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (!ACK_TAG.equals(message.optString("tag"))) return;
            PendingAck ack = pendingAck;
            if (ack == null || !ack.transferId.equals(message.optString("transferId"))) return;
            ack.ok = message.optBoolean("ok", false);
            ack.revision = message.optString("revision", null);
            ack.latch.countDown();
        } catch (Exception ignored) {}
    }

    private boolean sendTransfer(String nodeId, String data, boolean requireAck) {
        String transferId = UUID.randomUUID().toString();
        byte[][] frames = buildFrames(data, transferId);
        for (int attempt = 0; attempt < (requireAck ? MAX_RETRIES : 1); attempt++) {
            PendingAck ack = requireAck ? new PendingAck(transferId) : null;
            pendingAck = ack;
            boolean sent = sendFrames(nodeId, frames);
            if (!requireAck) {
                pendingAck = null;
                return sent;
            }
            boolean acknowledged = sent && ack.await(ACK_TIMEOUT_MS);
            pendingAck = null;
            if (acknowledged && ack.ok) return true;
        }
        return false;
    }

    private boolean sendFrames(String nodeId, byte[][] frames) {
        try {
            for (byte[] frame : frames) {
                // sendMessage callbacks are delivered asynchronously. This
                // method can be reached through the synchronous WebView
                // JavascriptInterface on Android's main thread; waiting for
                // the SDK Task there makes every non-immediate send look like
                // a failure. The transfer-level ACK below is the reliable
                // completion signal, so only enforce the frame size here.
                if (frame.length > MAX_FRAME_BYTES) {
                    lastError = "message_send_failed";
                    return false;
                }
                messageApi.sendMessage(nodeId, frame);
            }
            lastError = null;
            return true;
        } catch (Exception error) {
            lastError = "message_send_failed";
            return false;
        }
    }

    private static boolean awaitTask(Task<?> task, long timeoutMs) {
        if (task == null) return false;
        if (task.isComplete()) return task.isSuccessful();
        // SDK callbacks may run on the main thread; never block that thread waiting for one.
        if (Looper.myLooper() == Looper.getMainLooper()) return false;
        CountDownLatch completed = new CountDownLatch(1);
        task.addOnSuccessListener(ignored -> completed.countDown())
            .addOnFailureListener(error -> completed.countDown());
        await(completed, timeoutMs);
        return completed.getCount() == 0 && task.isSuccessful();
    }

    private static byte[][] buildFrames(String data, String transferId) {
        byte[] snapshot = envelope("snapshot", transferId, 0, 1, data);
        if (snapshot.length <= MAX_FRAME_BYTES) return new byte[][]{snapshot};
        java.util.ArrayList<String> pieces = new java.util.ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (int offset = 0; offset < data.length();) {
            int codePoint = data.codePointAt(offset);
            String part = new String(Character.toChars(codePoint));
            current.append(part);
            // Reserve the maximum possible index/total widths while measuring JSON escaping.
            if (envelope("chunk", transferId, Integer.MAX_VALUE, Integer.MAX_VALUE, current.toString()).length > MAX_FRAME_BYTES) {
                current.setLength(current.length() - part.length());
                if (current.length() == 0) throw new IllegalArgumentException("code point exceeds frame limit");
                pieces.add(current.toString());
                current.setLength(0);
                current.append(part);
            }
            offset += Character.charCount(codePoint);
        }
        if (current.length() > 0) pieces.add(current.toString());
        byte[][] frames = new byte[pieces.size()][];
        for (int index = 0; index < pieces.size(); index++) {
            frames[index] = envelope("chunk", transferId, index, pieces.size(), pieces.get(index));
            if (frames[index].length > MAX_FRAME_BYTES) throw new IllegalArgumentException("frame exceeds limit");
        }
        return frames;
    }

    private static byte[] envelope(String kind, String transferId, int index, int total, String data) {
        JSONObject message = new JSONObject();
        try {
            message.put("tag", LINK_TAG).put("kind", kind).put("transferId", transferId)
                .put("index", index).put("total", total).put("data", data);
        } catch (Exception ignored) {}
        return message.toString().getBytes(StandardCharsets.UTF_8);
    }

    private void unregister(Node node) {
        try { messageApi.removeListener(node.id); } catch (Exception ignored) {}
        try { nodeApi.unsubscribe(node.id, DataItem.ITEM_CONNECTION); } catch (Exception ignored) {}
        listenersRegistered = false;
    }

    private void finishDiscovery(CountDownLatch done) { if (done != null) done.countDown(); }

    private static void await(CountDownLatch latch, long timeoutMs) {
        try { latch.await(timeoutMs, TimeUnit.MILLISECONDS); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
    }

    private JSONObject base() {
        JSONObject value = new JSONObject();
        try { value.put("api", API).put("adapter", "xiaomi-wearable-aar"); }
        catch (Exception ignored) {}
        return value;
    }

    private JSONObject operationResult(String operation, boolean ok) {
        return operationResult(operation, ok, ok ? null : "operation_failed");
    }

    private JSONObject operationResult(String operation, boolean ok, String error) {
        JSONObject result = base();
        try {
            result.put("ok", ok).put("operation", operation).put("state", state);
            String resolvedError = error == null ? null : (lastError == null ? error : lastError);
            if (resolvedError != null) result.put("error", resolvedError);
            result.put("nodeCount", lastNodeCount)
                .put("wearAppInstalled", lastWearAppInstalled == null ? JSONObject.NULL : lastWearAppInstalled)
                .put("permissionsGranted", lastPermissionsGranted == null ? JSONObject.NULL : lastPermissionsGranted)
                .put("serviceConnection", serviceConnectionStatus);
        } catch (Exception ignored) {}
        return result;
    }

    private static final class PendingAck {
        final String transferId;
        final CountDownLatch latch = new CountDownLatch(1);
        volatile boolean ok;
        volatile String revision;

        PendingAck(String transferId) { this.transferId = transferId; }
        boolean await(long timeoutMs) {
            try { latch.await(timeoutMs, TimeUnit.MILLISECONDS); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            return latch.getCount() == 0;
        }
    }
}
