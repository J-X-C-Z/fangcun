import 'dart:convert';
import 'dart:io';

// The exception keeps a named body parameter while the base exception uses a
// positional message, which is clearer at call sites.
// ignore_for_file: use_super_parameters

typedef JsonObject = Map<String, dynamic>;

class ServerHttpResponse {
  const ServerHttpResponse(this.statusCode, this.body);

  final int statusCode;
  final String body;

  JsonObject get json {
    final decoded = jsonDecode(body);
    if (decoded is! Map) {
      throw const FormatException('服务器响应不是 JSON 对象');
    }
    return Map<String, dynamic>.from(decoded);
  }
}

abstract interface class ServerTransport {
  Future<ServerHttpResponse> request(
    String method,
    Uri uri, {
    required Map<String, String> headers,
    String? body,
  });
}

class IoServerTransport implements ServerTransport {
  IoServerTransport({HttpClient? client}) : _client = client ?? HttpClient();

  final HttpClient _client;

  @override
  Future<ServerHttpResponse> request(
    String method,
    Uri uri, {
    required Map<String, String> headers,
    String? body,
  }) async {
    final request = await _client.openUrl(method, uri);
    headers.forEach(request.headers.set);
    if (body != null) {
      request.add(utf8.encode(body));
    }
    final response = await request.close();
    return ServerHttpResponse(
      response.statusCode,
      await utf8.decodeStream(response),
    );
  }
}

class FangcunApiException implements Exception {
  const FangcunApiException(this.statusCode, this.message, {this.body});

  final int statusCode;
  final String message;
  final JsonObject? body;

  @override
  String toString() => 'FangcunApiException($statusCode): $message';
}

class RevisionConflictException extends FangcunApiException {
  const RevisionConflictException({
    required this.remoteRevision,
    this.updatedAt,
    String? message,
    JsonObject? body,
  }) : super(409, message ?? '远程数据版本已变化，请重新读取后合并', body: body);

  final int remoteRevision;
  final String? updatedAt;
}

class SessionInfo {
  const SessionInfo({
    required this.accessToken,
    required this.tokenType,
    required this.expiresIn,
    required this.user,
  });

  final String accessToken;
  final String tokenType;
  final int expiresIn;
  final JsonObject user;
}

class DataSnapshot {
  const DataSnapshot({required this.data, required this.revision, this.updatedAt});

  final dynamic data;
  final int revision;
  final String? updatedAt;
}

class DataWriteResult {
  const DataWriteResult({required this.revision, this.updatedAt});

  final int revision;
  final String? updatedAt;
}

class LinkHealth {
  const LinkHealth({
    required this.schema,
    required this.version,
    required this.authenticated,
    required this.transport,
    required this.mode,
  });

  factory LinkHealth.fromJson(JsonObject json) => LinkHealth(
        schema: json['schema'] as String? ?? 'fangcun.link.v1',
        version: json['version'] is num ? (json['version'] as num).toInt() : 0,
        authenticated: json['authenticated'] == true,
        transport: json['transport'] as String? ?? 'not-connected',
        mode: json['mode'] as String? ?? 'pull-only',
      );

  final String schema;
  final int version;
  final bool authenticated;
  final String transport;
  final String mode;
}

class LinkSnapshot {
  const LinkSnapshot({
    required this.raw,
    required this.schema,
    required this.version,
    required this.dataState,
    required this.revision,
  });

  factory LinkSnapshot.fromJson(JsonObject json) {
    final schema = json['schema'];
    final version = json['version'];
    final dataState = json['dataState'];
    if (schema != 'fangcun.link.v1' || version != 1 ||
        !const ['mock', 'live', 'stale', 'empty'].contains(dataState)) {
      throw const FormatException('手环快照协议版本不受支持');
    }
    return LinkSnapshot(
      raw: json,
      schema: schema as String,
      version: version as int,
      dataState: dataState as String,
      revision: _int((json['sync'] as Map?)?['revision']),
    );
  }

  final JsonObject raw;
  final String schema;
  final int version;
  final String dataState;
  final int revision;

  JsonObject get payload => _object(raw['payload']);
}

class FangcunServerClient {
  FangcunServerClient({
    required Uri baseUrl,
    ServerTransport? transport,
  })  : _baseUrl = _normaliseBaseUrl(baseUrl),
        _transport = transport ?? IoServerTransport();

  final Uri _baseUrl;
  final ServerTransport _transport;
  String? _accessToken;

  bool get isAuthenticated => _accessToken != null;

  static Uri _normaliseBaseUrl(Uri value) => value.path.endsWith('/')
      ? value.replace(path: value.path.substring(0, value.path.length - 1))
      : value;

  Uri _uri(String path) => _baseUrl.replace(path: '${_baseUrl.path}$path');

  Future<JsonObject> health() => _send('GET', '/health', authenticated: false);

  Future<SessionInfo> login(String username, String password) async {
    final result = await _send('POST', '/auth/login', authenticated: false, body: {
      'username': username,
      'password': password,
      'client': 'flutter',
    });
    final token = result['accessToken'];
    final tokenType = result['tokenType'];
    final expiresIn = result['expiresIn'];
    if (token is! String || token.isEmpty || tokenType != 'Session' || expiresIn is! num) {
      throw const FormatException('登录响应缺少有效的 Session 令牌信息');
    }
    _accessToken = token;
    return SessionInfo(
      accessToken: token,
      tokenType: tokenType as String,
      expiresIn: expiresIn.toInt(),
      user: _object(result['user']),
    );
  }

  Future<JsonObject> session() => _send('GET', '/auth/session');

  Future<DataSnapshot> getData() async {
    final result = await _send('GET', '/data');
    return DataSnapshot(
      data: result['data'],
      revision: _int(result['revision']),
      updatedAt: result['updatedAt'] as String?,
    );
  }

  Future<DataWriteResult> putData(dynamic data, int baseRevision) async {
    final result = await _send('PUT', '/data', body: {
      'data': data,
      'baseRevision': baseRevision,
    });
    return DataWriteResult(
      revision: _int(result['revision']),
      updatedAt: result['updatedAt'] as String?,
    );
  }

  Future<LinkHealth> linkHealth() async => LinkHealth.fromJson(
        await _send('GET', '/link/health', authenticated: false),
      );

  Future<LinkSnapshot> getLinkSnapshot() async => LinkSnapshot.fromJson(
        await _send('GET', '/link/snapshot'),
      );

  Future<void> logout() async {
    try {
      await _send('POST', '/auth/logout');
    } finally {
      _accessToken = null;
    }
  }

  Future<JsonObject> _send(
    String method,
    String path, {
    bool authenticated = true,
    JsonObject? body,
  }) async {
    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (authenticated && _accessToken != null) {
      headers['Authorization'] = 'Session $_accessToken';
    }
    final response = await _transport.request(
      method,
      _uri('/api/v1$path'),
      headers: headers,
      body: body == null ? null : jsonEncode(body),
    );
    JsonObject? decoded;
    try {
      decoded = response.json;
    } on FormatException {
      decoded = null;
    }
    if (response.statusCode == 401) _accessToken = null;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 409) {
        throw RevisionConflictException(
          remoteRevision: _int(decoded?['revision']),
          updatedAt: decoded?['updatedAt'] as String?,
          message: decoded?['error'] as String?,
          body: decoded,
        );
      }
      throw FangcunApiException(
        response.statusCode,
        decoded?['error'] as String? ?? '服务器请求失败',
        body: decoded,
      );
    }
    return decoded ?? (throw const FormatException('服务器响应不是 JSON 对象'));
  }

  static JsonObject _object(dynamic value) => value is Map
      ? Map<String, dynamic>.from(value)
      : <String, dynamic>{};

  static int _int(dynamic value) => value is num ? value.toInt() : 0;
}
