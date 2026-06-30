import { createHmac, createHash, createSign, timingSafeEqual } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.resolve(__dirname, '../dist');
const port = Number(process.env.PORT || 80);
const maxBodyBytes = 1024 * 1024;
const maxResponseBytes = 1024 * 1024;
const profileSampleBytes = 256 * 1024;
const profileMaxRows = 500;
const authRequired = process.env.EZ_CONNECT_AUTH_DISABLED !== 'true';
const authPassword = String(process.env.EZ_CONNECT_AUTH_PASSWORD || '');
const authSecret = String(process.env.EZ_CONNECT_AUTH_SECRET || authPassword || '');
const configuredAuthTtlSeconds = Number(process.env.EZ_CONNECT_AUTH_TTL_SECONDS || 12 * 60 * 60);
const authTokenTtlSeconds = Number.isFinite(configuredAuthTtlSeconds) ? Math.max(configuredAuthTtlSeconds, 5 * 60) : 12 * 60 * 60;
const protectedApiRoutes = new Set(['/api/files/list', '/api/files/profile', '/api/database/test', '/api/http/request']);
const loginWindowMs = 15 * 60 * 1000;
const maxFailedLogins = 10;
const failedLoginAttempts = new Map();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/status') {
      sendJson(res, 200, authStatus(req));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const payload = await readJson(req);
      sendJson(res, 200, authenticateLogin(req, payload));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/capabilities') {
      sendJson(res, 200, {
        apiProxyEnabled: process.env.EZ_CONNECT_ENABLE_API_PROXY === 'true',
        fileConnectors: {
          s3: true,
          gcs: true,
          azure: true,
          sftp: false,
          local: false
        }
      });
      return;
    }

    if (protectedApiRoutes.has(url.pathname)) {
      requireAuthenticated(req);
    }

    if (req.method === 'POST' && url.pathname === '/api/files/list') {
      const payload = await readJson(req);
      const result = await listFiles(payload);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/files/profile') {
      const payload = await readJson(req);
      const result = await profileFile(payload);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/database/test') {
      const payload = await readJson(req);
      const result = await testDatabase(payload);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/http/request') {
      const payload = await readJson(req);
      const result = await proxyHttpRequest(payload);
      sendJson(res, 200, result);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
});

server.listen(port, () => {
  console.log(`EZ Connect Hub listening on ${port}`);
});

async function readJson(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new AppError(413, 'Request body is too large');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'Request body must be valid JSON');
  }
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(json);
}

function authConfigured() {
  return Boolean(authPassword);
}

function authStatus(req) {
  const verified = verifyAuthToken(authTokenFromRequest(req));
  return {
    required: authRequired,
    configured: authConfigured(),
    authenticated: !authRequired || verified.valid,
    expiresAt: verified.expiresAt
  };
}

function authenticateLogin(req, payload) {
  if (!authRequired) {
    return { token: '', expiresAt: null };
  }
  if (!authConfigured()) {
    throw new AppError(503, 'Authentication is required but EZ_CONNECT_AUTH_PASSWORD is not configured.');
  }

  assertLoginRateLimit(req);
  const password = String(payload?.password || '');
  if (!passwordMatches(password)) {
    recordFailedLogin(req);
    throw new AppError(401, 'Invalid app password');
  }

  clearFailedLogins(req);
  return issueAuthToken();
}

function requireAuthenticated(req) {
  if (!authRequired) return;
  if (!authConfigured()) {
    throw new AppError(503, 'Authentication is required before accepting credentials. Set EZ_CONNECT_AUTH_PASSWORD for this deployment.');
  }

  const verified = verifyAuthToken(authTokenFromRequest(req));
  if (!verified.valid) throw new AppError(401, 'Authentication required');
}

function issueAuthToken() {
  const expiresAtMs = Date.now() + authTokenTtlSeconds * 1000;
  const payload = {
    aud: 'ez-connect-hub',
    exp: Math.floor(expiresAtMs / 1000),
    iat: Math.floor(Date.now() / 1000),
    v: 1
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return {
    token: `${encodedPayload}.${signAuth(encodedPayload)}`,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

function verifyAuthToken(token) {
  if (!authRequired) return { valid: true };
  if (!authConfigured() || !authSecret || !token) return { valid: false };

  const [encodedPayload, signature, ...extra] = String(token).split('.');
  if (!encodedPayload || !signature || extra.length) return { valid: false };
  if (!safeEqualString(signAuth(encodedPayload), signature)) return { valid: false };

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const expiresAt = Number(payload.exp || 0) * 1000;
    if (payload.aud !== 'ez-connect-hub' || expiresAt <= Date.now()) return { valid: false };
    return { valid: true, expiresAt: new Date(expiresAt).toISOString() };
  } catch {
    return { valid: false };
  }
}

function authTokenFromRequest(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }
  return String(req.headers['x-ez-connect-auth'] || '').trim();
}

function signAuth(value) {
  return toBase64Url(createHmac('sha256', authSecret).update(value).digest());
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function passwordMatches(candidate) {
  const actual = createHash('sha256').update(authPassword).digest();
  const proposed = createHash('sha256').update(String(candidate)).digest();
  return timingSafeEqual(actual, proposed);
}

function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function assertLoginRateLimit(req) {
  const key = loginRateKey(req);
  const attempts = currentLoginAttempts(key);
  if (attempts.length >= maxFailedLogins) {
    throw new AppError(429, 'Too many failed sign-in attempts. Try again later.');
  }
}

function recordFailedLogin(req) {
  const key = loginRateKey(req);
  failedLoginAttempts.set(key, [...currentLoginAttempts(key), Date.now()]);
}

function clearFailedLogins(req) {
  failedLoginAttempts.delete(loginRateKey(req));
}

function currentLoginAttempts(key) {
  const now = Date.now();
  const attempts = (failedLoginAttempts.get(key) || []).filter(timestamp => now - timestamp < loginWindowMs);
  failedLoginAttempts.set(key, attempts);
  return attempts;
}

function loginRateKey(req) {
  return String(req.headers['fly-client-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

async function testDatabase(payload) {
  const type = String(payload?.type || '');
  const config = payload?.config || {};

  switch (type) {
    case 'postgres':
      return testPostgres(config);
    case 'mysql':
      return testMysql(config);
    case 'mssql':
      return testMssql(config);
    case 'snowflake':
      throw new AppError(501, 'Snowflake live connection testing is not enabled yet. Save the configuration locally, or add the Snowflake driver/test flow next.');
    case 'bigquery':
      throw new AppError(501, 'BigQuery live connection testing needs a service-account based configuration flow. Save the configuration locally, or add the BigQuery test flow next.');
    default:
      throw new AppError(400, 'Unsupported database source type');
  }
}

async function testPostgres(config) {
  const details = parseDbConfig(config, 5432);
  return withDatabaseError('PostgreSQL', details, async () => {
    const pg = await import('pg');
    const Client = pg.Client || pg.default?.Client;
    const client = new Client({
      host: details.host,
      port: details.port,
      database: details.database,
      user: details.username,
      password: details.password,
      ssl: dbSslOptions(details.sslMode),
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
      application_name: 'ez-connect-hub'
    });

    try {
      await client.connect();
      const result = await client.query('select current_database() as database, current_user as "user", version() as version');
      const row = result.rows?.[0] || {};
      return dbSuccess('postgres', 'Connected to PostgreSQL.', row);
    } finally {
      await client.end().catch(() => {});
    }
  });
}

async function testMysql(config) {
  const details = parseDbConfig(config, 3306);
  return withDatabaseError('MySQL', details, async () => {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection({
      host: details.host,
      port: details.port,
      database: details.database,
      user: details.username,
      password: details.password,
      connectTimeout: 10000,
      ssl: dbSslOptions(details.sslMode) || undefined
    });

    try {
      const [rows] = await connection.query('select database() as database, user() as user, version() as version');
      return dbSuccess('mysql', 'Connected to MySQL.', rows?.[0] || {});
    } finally {
      await connection.end().catch(() => {});
    }
  });
}

async function testMssql(config) {
  const details = parseDbConfig(config, 1433);
  return withDatabaseError('SQL Server', details, async () => {
    const mssqlModule = await import('mssql');
    const sql = mssqlModule.default || mssqlModule;
    const pool = new sql.ConnectionPool({
      server: details.host,
      port: details.port,
      database: details.database,
      user: details.username,
      password: details.password,
      connectionTimeout: 10000,
      requestTimeout: 10000,
      pool: { min: 0, max: 1, idleTimeoutMillis: 1000 },
      options: {
        encrypt: details.sslMode !== 'disable',
        trustServerCertificate: !['verify-ca', 'verify-full'].includes(details.sslMode)
      }
    });

    try {
      await pool.connect();
      const result = await pool.request().query('select DB_NAME() as [database], SUSER_SNAME() as [user], @@VERSION as [version]');
      return dbSuccess('mssql', 'Connected to SQL Server.', result.recordset?.[0] || {});
    } finally {
      await pool.close().catch(() => {});
    }
  });
}

function parseDbConfig(config, defaultPort) {
  const details = {
    host: String(config.host || '').trim(),
    port: Number(config.port || defaultPort),
    database: String(config.database || '').trim(),
    username: String(config.username || '').trim(),
    password: String(config.password || ''),
    sslMode: String(config.sslMode || 'disable').trim().toLowerCase()
  };
  const missing = [];
  if (!details.host) missing.push('Host');
  if (!Number.isFinite(details.port) || details.port <= 0) missing.push('Port');
  if (!details.database) missing.push('Database');
  if (!details.username) missing.push('Username');
  if (!details.password) missing.push('Password');
  if (missing.length) throw new AppError(400, `Missing: ${missing.join(', ')}`);
  if (!['disable', 'require', 'verify-ca', 'verify-full'].includes(details.sslMode)) {
    throw new AppError(400, 'SSL Mode must be disable, require, verify-ca, or verify-full');
  }
  return details;
}

function dbSslOptions(sslMode) {
  if (!sslMode || sslMode === 'disable') return false;
  return { rejectUnauthorized: ['verify-ca', 'verify-full'].includes(sslMode) };
}

async function withDatabaseError(provider, details, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, `${provider} connection failed: ${redactDbError(error, details)}`);
  }
}

function dbSuccess(provider, message, row) {
  const version = String(row.version || '').split('\n')[0].trim();
  return {
    provider,
    message,
    metadata: {
      database: String(row.database || ''),
      user: String(row.user || ''),
      version
    }
  };
}

function redactDbError(error, details) {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of [details.password, details.username]) {
    if (value) message = message.split(value).join('[redacted]');
  }
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function serveStatic(pathname, res) {
  const requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(staticRoot, safePath);

  if (!filePath.startsWith(staticRoot)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(staticRoot, 'index.html');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    'content-type': mimeTypes[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable'
  });
  createReadStream(filePath).pipe(res);
}

async function listFiles(payload) {
  const type = String(payload?.type || '');
  const config = payload?.config || {};

  switch (type) {
    case 'azure':
      return listAzure(config);
    case 's3':
      return listS3(config);
    case 'gcs':
      return listGcs(config);
    case 'sftp':
      throw new AppError(501, 'SFTP listing needs an SSH client dependency and private network reachability. It is not enabled in this deployment yet.');
    case 'local':
      throw new AppError(501, 'Local/NFS listing requires the path to be mounted inside the Fly machine. It is not enabled in this deployment yet.');
    default:
      throw new AppError(400, 'Unsupported file source type');
  }
}

async function listAzure(config) {
  const details = parseAzureConfig(config);
  const url = new URL(`${details.endpoint.replace(/\/$/, '')}/${encodeURIComponent(details.container)}`);
  url.searchParams.set('restype', 'container');
  url.searchParams.set('comp', 'list');
  url.searchParams.set('maxresults', '200');
  if (details.prefix) url.searchParams.set('prefix', details.prefix);
  if (details.sas) appendSas(url, details.sas);

  const headers = {};
  if (details.accountKey && !details.sas) {
    headers['x-ms-date'] = new Date().toUTCString();
    headers['x-ms-version'] = '2020-10-02';
    headers.Authorization = azureSharedKey('GET', url, details.accountName, details.accountKey, headers);
  }

  const response = await fetch(url, { headers });
  const body = await response.text();
  if (!response.ok) throw new AppError(502, `Azure Blob returned ${response.status}: ${stripXml(body)}`);

  return {
    provider: 'azure',
    source: `azure://${details.accountName}/${details.container}/${details.prefix || ''}`,
    files: parseAzureBlobs(body, details)
  };
}

function parseAzureConfig(config) {
  const rawConnection = String(config.connectionString || '').trim();
  const container = String(config.container || '').trim();
  const prefix = String(config.pathPrefix || '').replace(/^\/+/, '');

  if (!rawConnection) throw new AppError(400, 'Azure connection string or SAS URL is required');

  if (/^https?:\/\//i.test(rawConnection)) {
    const parsed = new URL(rawConnection);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const inferredContainer = container || pathParts[0];
    if (!inferredContainer) throw new AppError(400, 'Azure container is required');
    return {
      accountName: parsed.hostname.split('.')[0],
      endpoint: `${parsed.protocol}//${parsed.hostname}`,
      container: inferredContainer,
      prefix: prefix || pathParts.slice(1).join('/'),
      sas: parsed.search.replace(/^\?/, '')
    };
  }

  const parts = parseConnectionString(rawConnection);
  const accountName = parts.AccountName || String(config.account || '').trim();
  const accountKey = parts.AccountKey;
  const sas = parts.SharedAccessSignature;
  const suffix = parts.EndpointSuffix || 'core.windows.net';
  const protocol = parts.DefaultEndpointsProtocol || 'https';
  const endpoint = parts.BlobEndpoint || `${protocol}://${accountName}.blob.${suffix}`;

  if (!accountName) throw new AppError(400, 'Azure storage account name is required');
  if (!container) throw new AppError(400, 'Azure container is required');
  if (!accountKey && !sas) throw new AppError(400, 'Azure connection string must include AccountKey or SharedAccessSignature');

  return { accountName, accountKey, sas, endpoint, container, prefix };
}

function azureSharedKey(method, url, accountName, accountKey, headers) {
  const canonicalHeaders = Object.entries(headers)
    .filter(([key]) => key.toLowerCase().startsWith('x-ms-'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key.toLowerCase()}:${String(value).trim()}\n`)
    .join('');

  const params = [...url.searchParams.entries()]
    .map(([key, value]) => [key.toLowerCase(), value])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${decodeURIComponent(value)}`)
    .join('\n');

  const canonicalResource = `/${accountName}${url.pathname}${params ? `\n${params}` : ''}`;
  const stringToSign = [
    method, '', '', '', '', '', '', '', '', '', '', '',
    canonicalHeaders + canonicalResource
  ].join('\n');

  const signature = createHmac('sha256', Buffer.from(accountKey, 'base64')).update(stringToSign, 'utf8').digest('base64');
  return `SharedKey ${accountName}:${signature}`;
}

function parseAzureBlobs(xml, details) {
  return matchAll(xml, /<Blob>([\s\S]*?)<\/Blob>/g).map((blob, index) => {
    const name = xmlValue(blob, 'Name');
    const size = Number(xmlValue(blob, 'Content-Length') || 0);
    return {
      id: `${details.container}-${index}-${name}`,
      name: path.posix.basename(name),
      path: `azure://${details.accountName}/${details.container}/${name}`,
      kind: fileKind(name, xmlValue(blob, 'Content-Type')),
      sizeBytes: size,
      modifiedAt: new Date(xmlValue(blob, 'Last-Modified') || Date.now()).toISOString(),
      owner: details.accountName,
      storageClass: xmlValue(blob, 'AccessTier') || xmlValue(blob, 'BlobType') || 'Blob',
      encrypted: xmlValue(blob, 'ServerEncrypted') !== 'false'
    };
  });
}

async function listS3(config) {
  const accessKey = String(config.accessKey || '').trim();
  const secretKey = String(config.secretKey || '').trim();
  const region = String(config.region || 'us-east-1').trim();
  const bucket = String(config.bucket || '').trim();
  const prefix = String(config.pathPrefix || '').replace(/^\/+/, '');
  const endpoint = String(config.endpoint || '').replace(/\/$/, '');

  if (!accessKey || !secretKey || !region || !bucket) throw new AppError(400, 'S3 region, bucket, access key, and secret key are required');

  const url = endpoint
    ? new URL(`${endpoint}/${encodeURIComponent(bucket)}`)
    : new URL(`https://${bucket}.s3.${region}.amazonaws.com/`);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('max-keys', '200');
  if (prefix) url.searchParams.set('prefix', prefix);

  const headers = signS3Request(url, region, accessKey, secretKey);
  const response = await fetch(url, { headers });
  const body = await response.text();
  if (!response.ok) throw new AppError(502, `S3 returned ${response.status}: ${stripXml(body)}`);

  return {
    provider: 's3',
    source: `s3://${bucket}/${prefix}`,
    files: parseS3Objects(body, bucket)
  };
}

function signS3Request(url, region, accessKey, secretKey) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');
  const query = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeRFC3986(key)}=${encodeRFC3986(value)}`)
    .join('&');
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['GET', url.pathname || '/', query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = getAwsSigningKey(secretKey, dateStamp, region, 's3');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
}

function parseS3Objects(xml, bucket) {
  return matchAll(xml, /<Contents>([\s\S]*?)<\/Contents>/g).map((item, index) => {
    const key = xmlValue(item, 'Key');
    return {
      id: `${bucket}-${index}-${key}`,
      name: path.posix.basename(key),
      path: `s3://${bucket}/${key}`,
      kind: fileKind(key),
      sizeBytes: Number(xmlValue(item, 'Size') || 0),
      modifiedAt: new Date(xmlValue(item, 'LastModified') || Date.now()).toISOString(),
      owner: bucket,
      storageClass: xmlValue(item, 'StorageClass') || 'Standard',
      encrypted: false
    };
  });
}

async function listGcs(config) {
  const bucket = String(config.bucket || '').trim();
  const projectId = String(config.projectId || '').trim();
  const prefix = String(config.pathPrefix || '').replace(/^\/+/, '');
  const serviceAccountText = String(config.serviceAccount || '').trim();

  if (!bucket || !projectId || !serviceAccountText) throw new AppError(400, 'GCS project, bucket, and service account JSON are required');
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountText);
  } catch {
    throw new AppError(400, 'GCS service account JSON must be valid JSON');
  }
  const token = await getGcsToken(serviceAccount);
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  url.searchParams.set('maxResults', '200');
  if (prefix) url.searchParams.set('prefix', prefix);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.text();
  if (!response.ok) throw new AppError(502, `GCS returned ${response.status}: ${body.slice(0, 300)}`);
  const data = JSON.parse(body);

  return {
    provider: 'gcs',
    source: `gs://${bucket}/${prefix}`,
    files: (data.items || []).map((item, index) => ({
      id: `${bucket}-${index}-${item.name}`,
      name: path.posix.basename(item.name),
      path: `gs://${bucket}/${item.name}`,
      kind: fileKind(item.name, item.contentType),
      sizeBytes: Number(item.size || 0),
      modifiedAt: new Date(item.updated || Date.now()).toISOString(),
      owner: projectId,
      storageClass: item.storageClass || 'Standard',
      encrypted: true
    }))
  };
}

async function getGcsToken(serviceAccount) {
  const iat = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_only',
    aud: 'https://oauth2.googleapis.com/token',
    exp: iat + 3600,
    iat
  }));
  const unsigned = `${header}.${claim}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const body = await response.json();
  if (!response.ok) throw new AppError(502, `GCS auth failed: ${body.error_description || body.error || response.status}`);
  return body.access_token;
}

async function profileFile(payload) {
  const type = String(payload?.type || '');
  const config = payload?.config || {};
  const file = payload?.file || {};
  const filePath = String(file.path || '').trim();
  const fileName = String(file.name || path.posix.basename(filePath)).trim();

  if (!filePath) throw new AppError(400, 'File path is required for profiling');

  const format = profileFormat(fileName || filePath, file.kind);
  if (!format) {
    return profilePlaceholder(filePath, `unsupported_format_${String(file.kind || fileKind(fileName || filePath)).toLowerCase()}`);
  }

  let sample;
  try {
    sample = await readProfileSample(type, config, filePath);
  } catch (error) {
    return profilePlaceholder(filePath, profileErrorStatus(error));
  }

  if (looksBinary(sample)) return profilePlaceholder(filePath, 'unsupported_binary_sample');

  const parsed = parseProfileSample(sample, format);
  if (!parsed.rows.length) {
    return {
      filePath,
      rowCount: 0,
      sourceSchemaJson: {},
      primaryKeyCandidate: 'FALSE',
      identityCandidate: 'FALSE',
      nullableColumnCount: 0,
      profilingStatus: 'profiled_no_rows'
    };
  }

  return {
    filePath,
    ...inferProfile(parsed.columns, parsed.rows, format.label)
  };
}

function profileFormat(fileName, kind) {
  const lowerName = String(fileName || '').toLowerCase();
  const lowerKind = String(kind || '').toLowerCase();

  if (lowerName.endsWith('.jsonl') || lowerName.endsWith('.ndjson') || ['jsonl', 'ndjson'].includes(lowerKind)) {
    return { type: 'jsonl', label: 'jsonl' };
  }

  if (lowerName.endsWith('.json') || lowerKind === 'json') {
    return { type: 'json', label: 'json' };
  }

  if (lowerName.endsWith('.tsv') || lowerKind === 'tsv') {
    return { type: 'delimited', label: 'tsv', delimiter: '\t' };
  }

  if (lowerName.endsWith('.csv') || lowerKind === 'csv') {
    return { type: 'delimited', label: 'csv', delimiter: ',' };
  }

  if (lowerName.endsWith('.txt') || lowerKind === 'txt') {
    return { type: 'delimited', label: 'delimited' };
  }

  return null;
}

function profilePlaceholder(filePath, status) {
  return {
    filePath,
    rowCount: 'not_profiled',
    sourceSchemaJson: {},
    primaryKeyCandidate: 'FALSE',
    identityCandidate: 'FALSE',
    nullableColumnCount: 'not_profiled',
    profilingStatus: status
  };
}

function profileErrorStatus(error) {
  const message = error instanceof Error ? error.message : 'profile_error';
  if (/Azure Blob 403 AuthorizationResourceTypeMismatch/i.test(message)) {
    return 'not_profiled_azure_sas_needs_blob_or_object_resource';
  }
  if (/Azure Blob 403 AuthorizationPermissionMismatch/i.test(message)) {
    return 'not_profiled_azure_sas_needs_read_permission';
  }
  return `not_profiled_${statusToken(message)}`;
}

function statusToken(value) {
  return String(value || 'profile_error')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'profile_error';
}

async function readProfileSample(type, config, filePath) {
  switch (type) {
    case 'azure':
      return readAzureSample(config, filePath);
    case 's3':
      return readS3Sample(config, filePath);
    case 'gcs':
      return readGcsSample(config, filePath);
    case 'sftp':
      throw new AppError(501, 'SFTP profiling is not enabled in this deployment yet.');
    case 'local':
      throw new AppError(501, 'Local/NFS profiling is not enabled in this deployment yet.');
    default:
      throw new AppError(400, 'Unsupported file source type');
  }
}

async function readAzureSample(config, filePath) {
  const details = parseAzureConfig(config);
  const target = parseAzurePath(filePath);
  if (!target.blobName) throw new AppError(400, 'Azure blob path is required for profiling');
  if (target.accountName && target.accountName.toLowerCase() !== details.accountName.toLowerCase()) {
    throw new AppError(400, 'Azure blob path does not match the configured storage account');
  }
  if (target.container.toLowerCase() !== details.container.toLowerCase()) {
    throw new AppError(400, 'Azure blob path does not match the configured container');
  }

  const url = new URL(`${details.endpoint.replace(/\/$/, '')}/${encodeURIComponent(details.container)}/${encodePathSegments(target.blobName)}`);
  if (details.sas) appendSas(url, details.sas);

  const headers = {
    'x-ms-range': sampleRangeHeader(),
    'x-ms-version': '2020-10-02'
  };

  if (details.accountKey && !details.sas) {
    headers['x-ms-date'] = new Date().toUTCString();
    headers.Authorization = azureSharedKey('GET', url, details.accountName, details.accountKey, headers);
  }

  return fetchSampleText(url, headers, 'Azure Blob');
}

async function readS3Sample(config, filePath) {
  const accessKey = String(config.accessKey || '').trim();
  const secretKey = String(config.secretKey || '').trim();
  const region = String(config.region || 'us-east-1').trim();
  const bucket = String(config.bucket || '').trim();
  const endpoint = String(config.endpoint || '').replace(/\/$/, '');
  const target = parseBucketPath(filePath, 's3');

  if (!accessKey || !secretKey || !region || !bucket) throw new AppError(400, 'S3 region, bucket, access key, and secret key are required');
  if (target.bucket !== bucket) throw new AppError(400, 'S3 object path does not match the configured bucket');
  if (!target.key) throw new AppError(400, 'S3 object key is required for profiling');

  const url = endpoint
    ? new URL(`${endpoint}/${encodeURIComponent(bucket)}/${encodePathSegments(target.key)}`)
    : new URL(`https://${bucket}.s3.${region}.amazonaws.com/${encodePathSegments(target.key)}`);
  const headers = {
    ...signS3Request(url, region, accessKey, secretKey),
    Range: sampleRangeHeader()
  };

  return fetchSampleText(url, headers, 'S3 object');
}

async function readGcsSample(config, filePath) {
  const bucket = String(config.bucket || '').trim();
  const projectId = String(config.projectId || '').trim();
  const serviceAccountText = String(config.serviceAccount || '').trim();
  const target = parseBucketPath(filePath, 'gs');

  if (!bucket || !projectId || !serviceAccountText) throw new AppError(400, 'GCS project, bucket, and service account JSON are required');
  if (target.bucket !== bucket) throw new AppError(400, 'GCS object path does not match the configured bucket');
  if (!target.key) throw new AppError(400, 'GCS object name is required for profiling');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountText);
  } catch {
    throw new AppError(400, 'GCS service account JSON must be valid JSON');
  }

  const token = await getGcsToken(serviceAccount);
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(target.key)}`);
  url.searchParams.set('alt', 'media');

  return fetchSampleText(url, {
    Authorization: `Bearer ${token}`,
    Range: sampleRangeHeader()
  }, 'GCS object');
}

async function fetchSampleText(url, headers, label) {
  const response = await fetch(url, { headers });
  const text = await limitedText(response);
  if (!response.ok) throw new AppError(response.status, `${label} ${response.status} ${responseErrorCode(text, response.statusText)}`);
  return text.slice(0, profileSampleBytes);
}

function responseErrorCode(text, fallback) {
  const xmlCode = xmlValue(text, 'Code');
  if (xmlCode) return xmlCode;
  return statusToken(stripXml(text) || fallback || 'request_failed');
}

function parseBucketPath(filePath, scheme) {
  const prefix = `${scheme}://`;
  if (!String(filePath).startsWith(prefix)) throw new AppError(400, `Expected ${scheme}:// path for profiling`);
  const rest = String(filePath).slice(prefix.length);
  const slashIndex = rest.indexOf('/');
  const bucket = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  const key = slashIndex === -1 ? '' : rest.slice(slashIndex + 1);

  return {
    bucket,
    key: safeDecode(key)
  };
}

function parseAzurePath(filePath) {
  const prefix = 'azure://';
  if (!String(filePath).startsWith(prefix)) throw new AppError(400, 'Expected azure:// path for profiling');
  const rest = String(filePath).slice(prefix.length);
  const parts = rest.split('/');

  return {
    accountName: parts[0] || '',
    container: safeDecode(parts[1] || ''),
    blobName: safeDecode(parts.slice(2).join('/'))
  };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePathSegments(value) {
  return String(value).split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function sampleRangeHeader() {
  return `bytes=0-${profileSampleBytes - 1}`;
}

function looksBinary(text) {
  return /\u0000/.test(text.slice(0, 4096));
}

function parseProfileSample(text, format) {
  if (format.type === 'json') {
    return parseJsonSample(text);
  }
  if (format.type === 'jsonl') {
    return parseJsonLines(text);
  }
  return parseDelimitedSample(text, format);
}

function parseDelimitedSample(text, format) {
  const normalized = stripBom(text);
  const lines = normalized.split(/\r?\n/).filter(line => line.trim());
  if (normalized.length >= profileSampleBytes && !normalized.endsWith('\n') && lines.length > 1) lines.pop();
  if (!lines.length) return { columns: [], rows: [] };

  const delimiter = format.delimiter || detectDelimiter(lines[0]);
  const columns = uniqueColumns(parseDelimitedLine(lines[0], delimiter));
  const rows = lines.slice(1, profileMaxRows + 1).map(line => {
    const values = parseDelimitedLine(line, delimiter);
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
  });

  return { columns, rows };
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function detectDelimiter(line) {
  const candidates = [',', '\t', '|', ';'];
  return candidates
    .map(delimiter => ({ delimiter, count: parseDelimitedLine(line, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseJsonSample(text) {
  const normalized = stripBom(text).trim();
  try {
    const value = JSON.parse(normalized);
    const rows = jsonRows(value).slice(0, profileMaxRows);
    return { columns: jsonColumns(rows), rows };
  } catch {
    return parseJsonLines(text);
  }
}

function parseJsonLines(text) {
  const normalized = stripBom(text);
  const lines = normalized.split(/\r?\n/).filter(line => line.trim());
  if (normalized.length >= profileSampleBytes && !normalized.endsWith('\n') && lines.length > 1) lines.pop();

  const rows = [];
  for (const line of lines) {
    if (rows.length >= profileMaxRows) break;
    try {
      const value = JSON.parse(line);
      if (isPlainObject(value)) rows.push(value);
    } catch {
      // Ignore malformed trailing sample lines and keep rows already parsed.
    }
  }

  return { columns: jsonColumns(rows), rows };
}

function jsonRows(value) {
  if (Array.isArray(value)) return value.filter(isPlainObject);
  if (!isPlainObject(value)) return [];

  const nestedRows = Object.values(value).find(item => Array.isArray(item) && item.some(isPlainObject));
  if (nestedRows) return nestedRows.filter(isPlainObject);
  return [value];
}

function jsonColumns(rows) {
  return uniqueColumns([...new Set(rows.flatMap(row => Object.keys(row)))]);
}

function uniqueColumns(columns) {
  const seen = new Map();
  return columns.map((column, index) => {
    const base = String(column || '').trim() || `column_${index + 1}`;
    const count = (seen.get(base.toLowerCase()) || 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function inferProfile(columns, rows, formatLabel) {
  const stats = columns.map(column => columnStats(column, rows));
  const sourceSchemaJson = Object.fromEntries(stats.map(stat => [stat.name, inferDatabricksType(stat.nonNullValues)]));
  const nullableColumnCount = stats.filter(stat => stat.nullCount > 0).length;
  const primaryKeyColumns = choosePrimaryKeyColumns(stats, rows);
  const keyExpression = primaryKeyColumns.length ? primaryKeyColumns.join(',') : 'FALSE';

  return {
    rowCount: rows.length,
    sourceSchemaJson,
    primaryKeyCandidate: keyExpression,
    identityCandidate: keyExpression,
    nullableColumnCount,
    profilingStatus: `profiled_${formatLabel}_sample_rows_${rows.length}`
  };
}

function columnStats(column, rows) {
  const values = rows.map(row => row[column]);
  const nonNullValues = values.filter(value => !isNullLike(value));
  return {
    name: column,
    nullCount: values.length - nonNullValues.length,
    nonNullValues,
    distinctCount: new Set(nonNullValues.map(value => String(value))).size,
    type: inferDatabricksType(nonNullValues)
  };
}

function choosePrimaryKeyColumns(stats, rows) {
  const singleKey = chooseSingleKey(stats, rows.length);
  if (singleKey) return [singleKey.name];
  return chooseCompositeKey(stats, rows);
}

function chooseSingleKey(stats, rowCount) {
  const candidates = stats.filter(stat => rowCount > 0 && stat.nullCount === 0 && stat.distinctCount === rowCount);
  return candidates.sort((a, b) => keyScore(b) - keyScore(a))[0];
}

function chooseCompositeKey(stats, rows) {
  if (!rows.length) return [];
  const candidates = stats
    .filter(stat => stat.nullCount === 0 && stat.distinctCount > 1)
    .sort((a, b) => (keyScore(b) + b.distinctCount) - (keyScore(a) + a.distinctCount))
    .slice(0, 8);

  for (const size of [2, 3]) {
    for (const combo of combinations(candidates, size)) {
      if (isUniqueCombination(combo, rows)) return combo.map(stat => stat.name);
    }
  }

  return [];
}

function combinations(items, size, start = 0, prefix = []) {
  if (prefix.length === size) return [prefix];
  const output = [];
  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    output.push(...combinations(items, size, index + 1, [...prefix, items[index]]));
  }
  return output;
}

function isUniqueCombination(stats, rows) {
  const seen = new Set();
  for (const row of rows) {
    const key = stats.map(stat => String(row[stat.name] ?? '')).join('\u001f');
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function keyScore(stat) {
  const name = stat.name.toLowerCase();
  let score = 0;
  if (name === 'id') score += 8;
  if (name.endsWith('_id') || name.endsWith(' id')) score += 6;
  if (name.includes('key')) score += 4;
  if (name.includes('identifier')) score += 4;
  if (stat.type === 'BIGINT') score += 2;
  return score;
}

function inferDatabricksType(values) {
  if (!values.length) return 'STRING';
  if (values.every(isBooleanLike)) return 'BOOLEAN';
  if (values.every(isIntegerLike)) return 'BIGINT';
  if (values.every(isNumberLike)) return 'DOUBLE';
  if (values.every(isDateLike)) return 'DATE';
  if (values.every(isTimestampLike)) return 'TIMESTAMP';
  return 'STRING';
}

function isNullLike(value) {
  if (value == null) return true;
  const text = String(value).trim().toLowerCase();
  return text === '' || text === 'null' || text === 'undefined';
}

function isBooleanLike(value) {
  if (typeof value === 'boolean') return true;
  return /^(true|false)$/i.test(String(value).trim());
}

function isIntegerLike(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  return /^[-+]?\d+$/.test(String(value).trim());
}

function isNumberLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(String(value).trim());
}

function isDateLike(value) {
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

function isTimestampLike(value) {
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}[T\s]/.test(text) && !Number.isNaN(Date.parse(text));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

async function proxyHttpRequest(payload) {
  if (process.env.EZ_CONNECT_ENABLE_API_PROXY !== 'true') {
    throw new AppError(403, 'Server-side API proxy is disabled. Browser mode is available; enable EZ_CONNECT_ENABLE_API_PROXY=true behind auth before exposing a Postman-style proxy publicly.');
  }

  let target;
  try {
    target = new URL(String(payload.url || ''));
  } catch {
    throw new AppError(400, 'A valid request URL is required');
  }
  if (!['http:', 'https:'].includes(target.protocol)) throw new AppError(400, 'Only HTTP and HTTPS URLs are allowed');
  if (isPrivateHost(target.hostname)) throw new AppError(403, 'Private and localhost targets are blocked');

  const method = String(payload.method || 'GET').toUpperCase();
  const headers = sanitizeHeaders(payload.headers || {});
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(target, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : String(payload.body || ''),
      signal: controller.signal,
      redirect: 'follow'
    });
    const text = await limitedText(response);
    return {
      status: response.status,
      statusText: response.statusText,
      timeMs: Date.now() - started,
      headers: Object.fromEntries(response.headers.entries()),
      body: text,
      truncated: text.length >= maxResponseBytes
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function limitedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;

  while (total < maxResponseBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    chunks.push(chunk.slice(0, Math.max(0, maxResponseBytes - (total - chunk.length))));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function sanitizeHeaders(input) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = key.toLowerCase();
    if (['host', 'connection', 'content-length'].includes(normalized)) continue;
    if (value != null && String(value).trim()) output[key] = String(value);
  }
  return output;
}

function isPrivateHost(hostname) {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower.endsWith('.localhost') || /^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower) || /^172\.(1[6-9]|2\d|3[01])\./.test(lower);
}

function parseConnectionString(value) {
  return Object.fromEntries(value.split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index === -1 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
  }));
}

function appendSas(url, sas) {
  for (const [key, value] of new URLSearchParams(sas)) {
    if (!url.searchParams.has(key)) url.searchParams.append(key, value);
  }
}

function stripXml(xml) {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function matchAll(text, regex) {
  return [...text.matchAll(regex)].map(match => match[1]);
}

function xmlValue(text, tag) {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1]) : '';
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function fileKind(name, contentType = '') {
  const ext = path.posix.extname(name).replace('.', '').toUpperCase();
  if (ext) return ext;
  if (contentType) return contentType;
  return 'File';
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function getAwsSigningKey(secretKey, dateStamp, region, service) {
  const dateKey = createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
  const regionKey = createHmac('sha256', dateKey).update(region).digest();
  const serviceKey = createHmac('sha256', regionKey).update(service).digest();
  return createHmac('sha256', serviceKey).update('aws4_request').digest();
}

function encodeRFC3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}
