import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Check, ChevronDown, Database, Download, FileText, FolderOpen, Globe, HardDrive, LogOut, Plus, RefreshCw, Send, Settings, ShieldCheck, Trash2, X, Zap } from 'lucide-react';

type Section = 'files' | 'database' | 'api';
type ConnectorType = 's3' | 'gcs' | 'azure' | 'sftp' | 'local';
type ConnectionStatus = 'connected' | 'disconnected';
type DbConnectionStatus = 'connected' | 'saved' | 'error' | 'disconnected';
type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
type ApiTab = 'params' | 'authorization' | 'headers' | 'body' | 'settings';
type AuthType = 'No Auth' | 'Basic Auth' | 'Bearer Token' | 'JWT Bearer' | 'Digest Auth' | 'OAuth 1.0' | 'OAuth 2.0' | 'Hawk Authentication' | 'AWS Signature' | 'NTLM Authentication' | 'API Key' | 'Akamai EdgeGrid' | 'ASAP (Atlassian)';
type Transport = 'browser' | 'server';
type ApiKeyTarget = 'query' | 'header';

type Field = {
  key: string;
  label: string;
  control?: 'input' | 'textarea';
  type?: 'text' | 'password' | 'number';
  placeholder?: string;
  optional?: boolean;
};

type FileConnection = {
  id: string;
  type: ConnectorType;
  name: string;
  status: ConnectionStatus;
  color: string;
  icon: string;
  config: Record<string, string>;
  enabled: boolean;
  unavailableReason?: string;
};

type DbConnection = {
  id: string;
  type: 'postgres' | 'mysql' | 'mssql' | 'snowflake' | 'bigquery';
  name: string;
  color: string;
  icon: string;
  status: DbConnectionStatus;
  config: Record<string, string>;
  message?: string;
  metadata?: Record<string, string>;
};

type FileMetadata = {
  id: string;
  name: string;
  path: string;
  kind: string;
  sizeBytes: number;
  modifiedAt: string;
  owner: string;
  storageClass: string;
  encrypted: boolean;
  rows?: number;
};

type FileResult = {
  status: 'idle' | 'loading' | 'success' | 'error';
  files: FileMetadata[];
  message: string;
  source?: string;
};

type FileProfile = {
  filePath: string;
  rowCount: number | string;
  sourceSchemaJson: Record<string, string>;
  primaryKeyCandidate: string;
  identityCandidate: boolean;
  nullableColumnCount: number | string;
  profilingStatus: string;
};

type HeaderRow = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

type ApiResponse = {
  status: number;
  statusText: string;
  timeMs: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
};

type ApiSettings = {
  httpVersion: 'Auto' | 'HTTP/1' | 'HTTP/1.1' | 'HTTP/2';
  sslVerification: boolean;
  followRedirects: boolean;
  followOriginalMethod: boolean;
  followAuthHeader: boolean;
  removeRefererOnRedirect: boolean;
  strictHttpParser: boolean;
  encodeUrlAutomatically: boolean;
  disableCookieJar: boolean;
  useServerCipherSuite: boolean;
  maxRedirects: number;
};

type AppCapabilities = {
  apiProxyEnabled: boolean;
  fileConnectors: Partial<Record<ConnectorType, boolean>>;
};

type AuthStatus = {
  required: boolean;
  configured: boolean;
  authenticated: boolean;
  expiresAt?: string;
};

const authStorageKey = 'ez-connect-auth-token';

const fileConnectors: FileConnection[] = [
  { id: 's3', type: 's3', name: 'Amazon S3', status: 'disconnected', color: '#FF9900', icon: 'S3', config: {}, enabled: true },
  { id: 'gcs', type: 'gcs', name: 'Google Cloud Storage', status: 'disconnected', color: '#4285F4', icon: 'GCS', config: {}, enabled: true },
  { id: 'azure', type: 'azure', name: 'Azure Blob Storage', status: 'disconnected', color: '#0078D4', icon: 'AZ', config: {}, enabled: true },
  { id: 'sftp', type: 'sftp', name: 'SFTP', status: 'disconnected', color: '#4A5568', icon: 'SFTP', config: {}, enabled: false, unavailableReason: 'SFTP listing is not enabled in this deployment yet.' },
  { id: 'local', type: 'local', name: 'Local / NFS', status: 'disconnected', color: '#718096', icon: 'LOC', config: {}, enabled: false, unavailableReason: 'Local and NFS listing require a mounted path in the deployment and are not enabled yet.' }
];

const dbConnectors: DbConnection[] = [
  { id: 'postgres', type: 'postgres', name: 'PostgreSQL', color: '#336791', icon: 'PG', status: 'disconnected', config: {} },
  { id: 'mysql', type: 'mysql', name: 'MySQL', color: '#00618A', icon: 'SQL', status: 'disconnected', config: {} },
  { id: 'mssql', type: 'mssql', name: 'SQL Server', color: '#CC2927', icon: 'MS', status: 'disconnected', config: {} },
  { id: 'snowflake', type: 'snowflake', name: 'Snowflake', color: '#29B5E8', icon: 'SF', status: 'disconnected', config: {} },
  { id: 'bigquery', type: 'bigquery', name: 'BigQuery', color: '#4285F4', icon: 'BQ', status: 'disconnected', config: {} }
];

const fieldsByType: Record<ConnectorType, Field[]> = {
  s3: [
    { key: 'region', label: 'AWS Region', placeholder: 'us-east-1' },
    { key: 'bucket', label: 'Bucket Name', placeholder: 'analytics-landing' },
    { key: 'accessKey', label: 'Access Key ID' },
    { key: 'secretKey', label: 'Secret Access Key', type: 'password' },
    { key: 'endpoint', label: 'Endpoint URL', placeholder: 'https://s3-compatible.example.com', optional: true },
    { key: 'pathPrefix', label: 'Path Prefix', placeholder: 'landing/', optional: true }
  ],
  gcs: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'bucket', label: 'Bucket Name' },
    { key: 'serviceAccount', label: 'Service Account JSON', control: 'textarea', type: 'password' },
    { key: 'pathPrefix', label: 'Path Prefix', optional: true }
  ],
  azure: [
    { key: 'account', label: 'Storage Account Name', optional: true },
    { key: 'container', label: 'Container Name' },
    { key: 'connectionString', label: 'Connection String or SAS URL', type: 'password', control: 'textarea' },
    { key: 'pathPrefix', label: 'Path Prefix', optional: true }
  ],
  sftp: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port', type: 'number', placeholder: '22' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'baseDir', label: 'Base Directory', placeholder: '/incoming' }
  ],
  local: [
    { key: 'mountPath', label: 'Mount Path', placeholder: '/mnt/source' },
    { key: 'filePattern', label: 'File Pattern', placeholder: '*.csv, *.json', optional: true }
  ]
};

const sqlDbFields: Field[] = [
  { key: 'host', label: 'Host' },
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'database', label: 'Database' },
  { key: 'username', label: 'Username' },
  { key: 'password', label: 'Password', type: 'password' },
  { key: 'sslMode', label: 'SSL Mode', placeholder: 'require', optional: true }
];

const dbFieldsByType: Record<DbConnection['type'], Field[]> = {
  postgres: sqlDbFields,
  mysql: sqlDbFields,
  mssql: sqlDbFields,
  snowflake: [
    { key: 'account', label: 'Account Identifier', placeholder: 'xy12345.us-east-1' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'database', label: 'Database' },
    { key: 'schema', label: 'Schema', optional: true },
    { key: 'role', label: 'Role', optional: true }
  ],
  bigquery: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'dataset', label: 'Dataset' },
    { key: 'serviceAccount', label: 'Service Account JSON', control: 'textarea', type: 'password' },
    { key: 'location', label: 'Location', optional: true }
  ]
};

const methods: RequestMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const authTypes: AuthType[] = ['No Auth', 'Basic Auth', 'Bearer Token', 'JWT Bearer', 'Digest Auth', 'OAuth 1.0', 'OAuth 2.0', 'Hawk Authentication', 'AWS Signature', 'NTLM Authentication', 'API Key', 'Akamai EdgeGrid', 'ASAP (Atlassian)'];

const defaultApiSettings: ApiSettings = {
  httpVersion: 'Auto',
  sslVerification: false,
  followRedirects: true,
  followOriginalMethod: false,
  followAuthHeader: false,
  removeRefererOnRedirect: false,
  strictHttpParser: false,
  encodeUrlAutomatically: true,
  disableCookieJar: false,
  useServerCipherSuite: false,
  maxRedirects: 10
};

const defaultCapabilities: AppCapabilities = {
  apiProxyEnabled: false,
  fileConnectors: {}
};

const defaultAuthStatus: AuthStatus = {
  required: true,
  configured: false,
  authenticated: false
};

function App() {
  const [activeSection, setActiveSection] = useState<Section>('files');
  const [connections, setConnections] = useState<FileConnection[]>(fileConnectors);
  const [dbConnections, setDbConnections] = useState<DbConnection[]>(dbConnectors);
  const [selectedId, setSelectedId] = useState('s3');
  const [fileResults, setFileResults] = useState<Record<string, FileResult>>({});
  const [editingFile, setEditingFile] = useState<FileConnection | null>(null);
  const [editingDb, setEditingDb] = useState<DbConnection | null>(null);
  const [draftConfig, setDraftConfig] = useState<Record<string, string>>({});
  const [modalMessage, setModalMessage] = useState('');
  const [appAuthToken, setAppAuthToken] = useState(readStoredAuthToken);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(defaultAuthStatus);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const selectedSource = connections.find(connection => connection.id === selectedId) || connections[0];
  const selectedResult = fileResults[selectedSource.id] || idleResult();
  const connectedSources = connections.filter(connection => connection.status === 'connected');
  const totalSize = selectedResult.files.reduce((total, file) => total + file.sizeBytes, 0);
  const isAuthenticated = !authStatus.required || authStatus.authenticated;

  useEffect(() => {
    let isMounted = true;

    setAuthLoading(true);
    fetch('/api/auth/status', { headers: appAuthHeaders(appAuthToken) })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.error) throw new Error(body.error || `Request failed with ${response.status}`);
        const nextStatus = normalizeAuthStatus(body);
        if (!nextStatus.authenticated && appAuthToken) {
          clearStoredAuthToken();
          setAppAuthToken('');
        }
        if (isMounted) {
          setAuthStatus(nextStatus);
          setAuthError('');
        }
      })
      .catch(error => {
        if (isMounted) {
          setAuthStatus(defaultAuthStatus);
          setAuthError(error instanceof Error ? error.message : 'Unable to check authentication status');
        }
      })
      .finally(() => {
        if (isMounted) setAuthLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [appAuthToken]);

  async function handleSignIn(password: string) {
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || `Request failed with ${response.status}`);
      const token = String(body.token || '');
      storeAuthToken(token);
      setAppAuthToken(token);
      setAuthStatus({ required: true, configured: true, authenticated: true, expiresAt: body.expiresAt });
    } catch (error) {
      clearStoredAuthToken();
      setAppAuthToken('');
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in');
    } finally {
      setAuthLoading(false);
    }
  }

  function resetProtectedState() {
    setConnections(fileConnectors);
    setDbConnections(dbConnectors);
    setFileResults({});
    setSelectedId('s3');
    setEditingFile(null);
    setEditingDb(null);
    setDraftConfig({});
    setModalMessage('');
  }

  function handleSignOut() {
    clearStoredAuthToken();
    resetProtectedState();
    setAppAuthToken('');
    setAuthStatus(current => ({ ...current, authenticated: false, expiresAt: undefined }));
    setAuthError('');
  }

  function handleUnauthorized() {
    clearStoredAuthToken();
    resetProtectedState();
    setAppAuthToken('');
    setAuthStatus(current => ({ ...current, authenticated: false, expiresAt: undefined }));
    setAuthError('Your session expired. Sign in again before entering credentials.');
  }

  function openFileEditor(connection: FileConnection) {
    if (!connection.enabled) return;
    setEditingFile(connection);
    setEditingDb(null);
    setDraftConfig(connection.config);
    setModalMessage('');
  }

  function openDbEditor(connection: DbConnection) {
    setEditingDb(connection);
    setEditingFile(null);
    setDraftConfig(connection.config);
    setModalMessage('');
  }

  function closeModal() {
    setEditingFile(null);
    setEditingDb(null);
    setDraftConfig({});
    setModalMessage('');
  }

  async function testFileConnection(saveOnSuccess: boolean) {
    if (!editingFile) return;
    const missing = missingRequiredFields(editingFile, draftConfig);
    if (missing.length) {
      setModalMessage(`Missing: ${missing.join(', ')}`);
      return;
    }

    setModalMessage('Listing files...');
    const result = await listFiles(editingFile, draftConfig);
    if (result.status === 'success') {
      setModalMessage(`Connected. Found ${result.files.length} file${result.files.length === 1 ? '' : 's'}.`);
      if (saveOnSuccess) {
        setConnections(current => current.map(connection => connection.id === editingFile.id ? { ...connection, config: draftConfig, status: 'connected' } : connection));
        setSelectedId(editingFile.id);
        closeModal();
      }
    } else {
      setModalMessage(result.message);
    }
  }

  async function refreshSelectedSource() {
    if (!selectedSource || selectedSource.status !== 'connected') return;
    await listFiles(selectedSource, selectedSource.config);
  }

  async function listFiles(connection: FileConnection, config: Record<string, string>) {
    setFileResults(current => ({
      ...current,
      [connection.id]: { status: 'loading', files: current[connection.id]?.files || [], message: 'Listing files...' }
    }));

    try {
      const response = await fetch('/api/files/list', {
        method: 'POST',
        headers: appAuthHeaders(appAuthToken, { 'content-type': 'application/json' }),
        body: JSON.stringify({ type: connection.type, config })
      });
      const body = await response.json();
      if (response.status === 401) handleUnauthorized();
      if (!response.ok || body.error) throw new Error(body.error || `Request failed with ${response.status}`);

      const result: FileResult = {
        status: 'success',
        files: body.files || [],
        message: body.files?.length ? `Found ${body.files.length} files` : 'Connected, but no files matched this prefix.',
        source: body.source
      };
      setFileResults(current => ({ ...current, [connection.id]: result }));
      return result;
    } catch (error) {
      const result: FileResult = {
        status: 'error',
        files: [],
        message: error instanceof Error ? error.message : 'Unable to list files'
      };
      setFileResults(current => ({ ...current, [connection.id]: result }));
      return result;
    }
  }

  function missingDbFields() {
    if (!editingDb) return [];
    return dbFieldsByType[editingDb.type].filter(field => !field.optional && !draftConfig[field.key]?.trim()).map(field => field.label);
  }

  function saveDbConnection() {
    if (!editingDb) return;
    const missing = missingDbFields();
    if (missing.length) {
      setModalMessage(`Missing: ${missing.join(', ')}`);
      return;
    }

    setDbConnections(current => current.map(connection => connection.id === editingDb.id
      ? { ...connection, config: draftConfig, status: 'saved', message: 'Saved locally. Connection has not been tested.' }
      : connection));
    closeModal();
  }

  async function testDbConnection() {
    if (!editingDb) return;
    const missing = missingDbFields();
    if (missing.length) {
      setModalMessage(`Missing: ${missing.join(', ')}`);
      return;
    }

    setModalMessage('Testing database connection...');
    try {
      const response = await fetch('/api/database/test', {
        method: 'POST',
        headers: appAuthHeaders(appAuthToken, { 'content-type': 'application/json' }),
        body: JSON.stringify({ type: editingDb.type, config: draftConfig })
      });
      const body = await response.json();
      if (response.status === 401) handleUnauthorized();
      if (!response.ok || body.error) throw new Error(body.error || `Request failed with ${response.status}`);

      setDbConnections(current => current.map(connection => connection.id === editingDb.id
        ? {
          ...connection,
          config: draftConfig,
          status: 'connected',
          message: body.message || 'Database connection tested successfully.',
          metadata: body.metadata || {}
        }
        : connection));
      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to test database connection';
      setModalMessage(message);
      setDbConnections(current => current.map(connection => connection.id === editingDb.id
        ? { ...connection, config: draftConfig, status: 'error', message }
        : connection));
    }
  }

  if (!isAuthenticated) {
    return <AuthGate error={authError} loading={authLoading} status={authStatus} onSignIn={handleSignIn} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Zap size={20} /></span><span>EZ Connect</span></div>
        <nav className="nav-list">
          <NavButton active={activeSection === 'files'} icon={<FolderOpen size={19} />} label="File Connections" onClick={() => setActiveSection('files')} />
          <NavButton active={activeSection === 'database'} icon={<Database size={19} />} label="Database Connections" onClick={() => setActiveSection('database')} />
          <NavButton active={activeSection === 'api'} icon={<Globe size={19} />} label="API Connections" onClick={() => setActiveSection('api')} />
        </nav>
        {authStatus.required && (
          <div className="sidebar-footer">
            <button className="nav-item sign-out" onClick={handleSignOut}><LogOut size={18} /><span>Sign Out</span></button>
          </div>
        )}
      </aside>

      <main className="main-content">
        {activeSection === 'files' && (
          <FilesPage
            connections={connections}
            connectedSources={connectedSources}
            fileResults={fileResults}
            selectedId={selectedId}
            selectedResult={selectedResult}
            selectedSource={selectedSource}
            totalSize={totalSize}
            onConfigure={openFileEditor}
            onRefresh={refreshSelectedSource}
            onSelect={setSelectedId}
            appAuthToken={appAuthToken}
            onUnauthorized={handleUnauthorized}
          />
        )}

        {activeSection === 'database' && <DatabasePage connections={dbConnections} onConfigure={openDbEditor} />}
        {activeSection === 'api' && <ApiPage appAuthToken={appAuthToken} onUnauthorized={handleUnauthorized} />}
      </main>

      {editingFile && (
        <ConfigModal
          title={`Configure ${editingFile.name}`}
          fields={fieldsByType[editingFile.type]}
          config={draftConfig}
          message={modalMessage}
          primaryLabel="Save & List Files"
          secondaryLabel="Test List"
          onChange={setDraftConfig}
          onClose={closeModal}
          onPrimary={() => void testFileConnection(true)}
          onSecondary={() => void testFileConnection(false)}
        />
      )}

      {editingDb && (
        <ConfigModal
          title={`Configure ${editingDb.name}`}
          fields={dbFieldsByType[editingDb.type]}
          config={draftConfig}
          message={modalMessage || 'Save & Test validates the database from the server. Save Only keeps the fields in this browser without marking it connected.'}
          primaryLabel="Save & Test"
          secondaryLabel="Save Only"
          onChange={setDraftConfig}
          onClose={closeModal}
          onPrimary={() => void testDbConnection()}
          onSecondary={saveDbConnection}
        />
      )}
    </div>
  );
}

function AuthGate({
  error,
  loading,
  status,
  onSignIn
}: {
  error: string;
  loading: boolean;
  status: AuthStatus;
  onSignIn: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const configured = status.configured;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || !password.trim()) return;
    setSubmitting(true);
    await onSignIn(password);
    setSubmitting(false);
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-mark"><ShieldCheck size={22} /></div>
        <h1>Sign in to EZ Connect</h1>
        <p>Source credentials and live listings are protected by app access.</p>
        {!configured && !loading && (
          <div className="message error">Authentication is required but EZ_CONNECT_AUTH_PASSWORD is not configured for this deployment.</div>
        )}
        {error && <div className="message error">{error}</div>}
        <form onSubmit={submit}>
          <label className="form-field">App Password
            <input
              autoComplete="current-password"
              disabled={!configured || loading || submitting}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-action" disabled={!configured || loading || submitting || !password.trim()} type="submit">
            <ShieldCheck size={15} />{loading || submitting ? 'Checking...' : 'Sign In'}
          </button>
        </form>
      </section>
    </main>
  );
}

function FilesPage({
  connections,
  connectedSources,
  fileResults,
  selectedId,
  selectedResult,
  selectedSource,
  totalSize,
  onConfigure,
  onRefresh,
  onSelect,
  appAuthToken,
  onUnauthorized
}: {
  connections: FileConnection[];
  connectedSources: FileConnection[];
  fileResults: Record<string, FileResult>;
  selectedId: string;
  selectedResult: FileResult;
  selectedSource: FileConnection;
  totalSize: number;
  onConfigure: (connection: FileConnection) => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  appAuthToken: string;
  onUnauthorized: () => void;
}) {
  const latestModified = selectedResult.files[0]?.modifiedAt;
  const canDownloadCsv = selectedResult.status === 'success' && selectedResult.files.length > 0;
  const [csvExporting, setCsvExporting] = useState(false);
  const [csvExportMessage, setCsvExportMessage] = useState('');

  useEffect(() => {
    setCsvExportMessage('');
  }, [selectedId, selectedResult.status]);

  async function downloadInventoryCsv() {
    if (!canDownloadCsv || csvExporting) return;
    setCsvExporting(true);
    setCsvExportMessage('Profiling file samples...');

    try {
      const source = selectedResult.source || sourceLocation(selectedSource);
      const profiles = await profileFilesForCsv(appAuthToken, selectedSource, selectedResult.files, onUnauthorized);
      const csv = buildInventoryCsv(selectedSource, selectedResult, source, profiles);
      downloadTextFile(inventoryFileName(selectedSource), csv, 'text/csv;charset=utf-8');
      const errorCount = [...profiles.values()].filter(profile => profile.profilingStatus.startsWith('profile_error')).length;
      setCsvExportMessage(errorCount ? `Downloaded with ${errorCount} profile error${errorCount === 1 ? '' : 's'}.` : 'Downloaded profiled inventory CSV.');
    } catch (error) {
      setCsvExportMessage(error instanceof Error ? error.message : 'Unable to export profiled CSV');
    } finally {
      setCsvExporting(false);
    }
  }

  return (
    <>
      <header className="section-header">
        <div>
          <h1>File Connections</h1>
          <p>Connect to source systems and inspect file metadata.</p>
        </div>
        <button className="secondary-action" disabled={selectedSource.status !== 'connected' || selectedResult.status === 'loading'} onClick={onRefresh}>
          <RefreshCw size={15} />Refresh
        </button>
      </header>

      <div className="connector-grid">
        {connections.map(connection => {
          const result = fileResults[connection.id] || idleResult();
          const isEnabled = connection.enabled;
          const statusClass = isEnabled ? connection.status : 'saved';
          const statusLabel = isEnabled ? (connection.status === 'connected' ? 'Connected' : 'Not Connected') : 'Coming Soon';
          const cardMessage = isEnabled
            ? (result.status === 'idle' ? 'No live listing yet.' : result.message)
            : connection.unavailableReason || 'This connector is not available in this deployment yet.';
          return (
            <article className={isEnabled ? 'connector-card' : 'connector-card disabled'} key={connection.id}>
              <div className="connector-topline">
                <span className="connector-icon" style={{ backgroundColor: `${connection.color}20`, color: connection.color }}>{connection.icon}</span>
                <span className={`status-pill ${statusClass}`}>{connection.status === 'connected' && <Check size={12} />}{statusLabel}</span>
              </div>
              <h2>{connection.name}</h2>
              <p className={isEnabled && result.status === 'error' ? 'card-error' : 'card-muted'}>{cardMessage}</p>
              <button className="configure-button" disabled={!isEnabled} onClick={() => onConfigure(connection)}><Settings size={14} />{isEnabled ? (connection.status === 'connected' ? 'Configure' : 'Connect') : 'Unavailable'}</button>
            </article>
          );
        })}
      </div>

      <section className="inventory-panel">
        <div className="inventory-heading">
          <div><span className="eyebrow">File Visibility</span><h2>Source file inventory</h2></div>
          <div className="inventory-heading-actions">
            <span className="source-location">{selectedResult.source || sourceLocation(selectedSource)}</span>
            <button className="secondary-action" disabled={!canDownloadCsv || csvExporting} onClick={() => void downloadInventoryCsv()}>
              <Download size={15} />{csvExporting ? 'Profiling...' : 'Download CSV'}
            </button>
            {csvExportMessage && <span className="export-status">{csvExportMessage}</span>}
          </div>
        </div>

        {connectedSources.length > 0 && (
          <div className="source-tabs">
            {connectedSources.map(connection => <button key={connection.id} className={connection.id === selectedId ? 'active' : ''} onClick={() => onSelect(connection.id)}>{connection.name}</button>)}
          </div>
        )}

        {selectedResult.status === 'success' ? (
          <>
            <div className="summary-grid">
              <SummaryItem icon={<FileText size={18} />} value={String(selectedResult.files.length)} label="Files found" />
              <SummaryItem icon={<HardDrive size={18} />} value={formatBytes(totalSize)} label="Total size" />
              <SummaryItem icon={<ShieldCheck size={18} />} value={selectedResult.files.every(file => file.encrypted) ? 'Encrypted' : 'Mixed'} label="Protection" />
              <SummaryItem icon={<RefreshCw size={18} />} value={latestModified ? formatDate(latestModified) : '-'} label="Latest update" />
            </div>
            {selectedResult.files.length > 0 ? <FileTable files={selectedResult.files} /> : <EmptyState title="No files returned" />}
          </>
        ) : (
          <EmptyState title={selectedResult.status === 'loading' ? 'Listing files...' : connectedSources.length ? selectedResult.message : 'No connected file sources'} />
        )}
      </section>
    </>
  );
}

function FileTable({ files }: { files: FileMetadata[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Modified</th><th>Owner</th><th>Storage</th><th>Rows</th></tr></thead>
        <tbody>
          {files.map(file => (
            <tr key={file.id}>
              <td><strong>{file.name}</strong><small>{file.path}</small></td>
              <td>{file.kind}</td>
              <td>{formatBytes(file.sizeBytes)}</td>
              <td>{formatDate(file.modifiedAt)}</td>
              <td>{file.owner}</td>
              <td>{file.storageClass}</td>
              <td>{file.rows ? file.rows.toLocaleString() : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatabasePage({ connections, onConfigure }: { connections: DbConnection[]; onConfigure: (connection: DbConnection) => void }) {
  return (
    <>
      <header className="section-header">
        <div>
          <h1>Database Connections</h1>
          <p>Test database reachability from the server before marking a source connected.</p>
        </div>
      </header>
      <div className="connector-grid">
        {connections.map(connection => (
          <article className="connector-card" key={connection.id}>
            <div className="connector-topline">
              <span className="connector-icon" style={{ backgroundColor: `${connection.color}20`, color: connection.color }}>{connection.icon}</span>
              <span className={`status-pill ${dbStatusClass(connection.status)}`}>{connection.status === 'connected' && <Check size={12} />}{dbStatusLabel(connection.status)}</span>
            </div>
            <h2>{connection.name}</h2>
            <p className={connection.status === 'error' ? 'card-error' : 'card-muted'}>{databaseCardMessage(connection)}</p>
            <button className="configure-button" onClick={() => onConfigure(connection)}><Settings size={14} />Configure</button>
          </article>
        ))}
      </div>
    </>
  );
}

function ApiPage({ appAuthToken, onUnauthorized }: { appAuthToken: string; onUnauthorized: () => void }) {
  const [method, setMethod] = useState<RequestMethod>('GET');
  const [url, setUrl] = useState('https://api.github.com/repos/AG20172021/ez-connect-hub');
  const [params, setParams] = useState<HeaderRow[]>([{ id: 'sample-param', key: '', value: '', enabled: true }]);
  const [headers, setHeaders] = useState<HeaderRow[]>([{ id: 'content-type', key: 'Accept', value: 'application/json', enabled: true }]);
  const [body, setBody] = useState('');
  const [activeTab, setActiveTab] = useState<ApiTab>('authorization');
  const [authType, setAuthType] = useState<AuthType>('OAuth 2.0');
  const [authDropdownOpen, setAuthDropdownOpen] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [apiKeyName, setApiKeyName] = useState('appid');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyTarget, setApiKeyTarget] = useState<ApiKeyTarget>('query');
  const [transport, setTransport] = useState<Transport>('browser');
  const [settings, setSettings] = useState<ApiSettings>(defaultApiSettings);
  const [capabilities, setCapabilities] = useState<AppCapabilities>(defaultCapabilities);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch('/api/capabilities')
      .then(async res => {
        if (!res.ok) throw new Error(`Capabilities request failed with ${res.status}`);
        const data = await res.json() as Partial<AppCapabilities>;
        if (isMounted) {
          setCapabilities({
            apiProxyEnabled: Boolean(data.apiProxyEnabled),
            fileConnectors: data.fileConnectors || {}
          });
        }
      })
      .catch(() => {
        if (isMounted) setCapabilities(defaultCapabilities);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!capabilities.apiProxyEnabled && transport === 'server') {
      setTransport('browser');
    }
  }, [capabilities.apiProxyEnabled, transport]);

  const headerObject = useMemo(() => {
    const next: Record<string, string> = {};
    headers.filter(header => header.enabled && header.key.trim()).forEach(header => {
      next[header.key.trim()] = header.value;
    });
    if (['Bearer Token', 'JWT Bearer', 'OAuth 2.0'].includes(authType) && authToken.trim()) {
      next.Authorization = `Bearer ${authToken.trim()}`;
    }
    if (authType === 'API Key' && apiKeyTarget === 'header' && apiKeyValue.trim() && apiKeyName.trim()) {
      next[apiKeyName.trim()] = apiKeyValue.trim();
    }
    return next;
  }, [apiKeyName, apiKeyTarget, apiKeyValue, authToken, authType, headers]);

  const requestUrl = useMemo(() => {
    return buildRequestUrl(url, params, authType === 'API Key' && apiKeyTarget === 'query' ? { key: apiKeyName, value: apiKeyValue } : undefined);
  }, [apiKeyName, apiKeyTarget, apiKeyValue, authType, params, url]);

  function handleUrlInput(value: string) {
    const parsed = splitUrlParams(value);
    setUrl(parsed.baseUrl);
    setParams(parsed.params);
  }

  function syncApiKey() {
    const key = apiKeyName.trim();
    if (!key) return;
    if (apiKeyTarget === 'query') {
      setParams(current => upsertRow(current, key, apiKeyValue));
      setHeaders(current => removeRowByKey(current, key));
      setActiveTab('params');
    } else {
      setHeaders(current => upsertRow(current, key, apiKeyValue));
      setParams(current => removeRowByKey(current, key));
      setActiveTab('headers');
    }
  }

  async function sendRequest() {
    setSending(true);
    const started = performance.now();
    try {
      if (transport === 'server') {
        if (!capabilities.apiProxyEnabled) {
          throw new Error('Server proxy is disabled for this deployment. Use browser fetch, or enable EZ_CONNECT_ENABLE_API_PROXY after adding app auth and rate limits.');
        }
        const res = await fetch('/api/http/request', {
          method: 'POST',
          headers: appAuthHeaders(appAuthToken, { 'content-type': 'application/json' }),
          body: JSON.stringify({ method, url: requestUrl, headers: headerObject, body })
        });
        const data = await res.json();
        if (res.status === 401) onUnauthorized();
        if (!res.ok || data.error) throw new Error(data.error || `Request failed with ${res.status}`);
        setResponse({ ...data, timeMs: data.timeMs || Math.round(performance.now() - started) });
      } else {
        const res = await fetch(requestUrl, {
          method,
          headers: headerObject,
          body: ['GET', 'HEAD'].includes(method) ? undefined : body,
          redirect: settings.followRedirects ? 'follow' : 'manual'
        });
        const text = await res.text();
        setResponse({
          status: res.status,
          statusText: res.statusText,
          timeMs: Math.round(performance.now() - started),
          headers: Object.fromEntries(res.headers.entries()),
          body: text
        });
      }
    } catch (error) {
      setResponse({
        status: 0,
        statusText: 'Request Failed',
        timeMs: Math.round(performance.now() - started),
        headers: {},
        body: error instanceof Error ? error.message : 'Request failed',
        error: error instanceof Error ? error.message : 'Request failed'
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="api-workspace">
      <header className="request-line">
        <select className="method-select" value={method} onChange={event => setMethod(event.target.value as RequestMethod)}>
          {methods.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={requestUrl} onChange={event => handleUrlInput(event.target.value)} placeholder="https://api.example.com/resource" />
        <button className="primary-action" disabled={sending || !url.trim()} onClick={() => void sendRequest()}><Send size={15} />{sending ? 'Sending...' : 'Send'}</button>
      </header>

      <section className="api-panel request-panel">
        <div className="api-tabs">
          {(['params', 'authorization', 'headers', 'body', 'settings'] as ApiTab[]).map(tab => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              {tab === 'params' ? 'Params' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'params' && (
          <>
            <KeyValueEditor
              addLabel="Add Parameter"
              keyPlaceholder="Key"
              rows={params}
              valuePlaceholder="Value"
              onAdd={() => setParams([...params, emptyRow()])}
              onChange={(index, patch) => updateHeader(params, setParams, index, patch)}
              onRemove={id => setParams(params.filter(item => item.id !== id))}
            />
            <div className="url-preview">
              <strong>URL Preview</strong>
              <span>{requestUrl || 'Add a request URL above.'}</span>
            </div>
          </>
        )}

        {activeTab === 'authorization' && (
          <div className="auth-section">
            <label className="form-field auth-type-field">Type
              <div className="auth-select">
                <button type="button" onClick={() => setAuthDropdownOpen(!authDropdownOpen)}>
                  <span>{authType}</span>
                  <ChevronDown className="select-chevron" size={14} />
                </button>
                {authDropdownOpen && (
                  <div className="auth-menu">
                    {authTypes.map(option => (
                      <button key={option} className={authType === option ? 'selected' : ''} onClick={() => { setAuthType(option); setAuthDropdownOpen(false); }}>
                        <span>{authType === option ? <Check size={13} /> : null}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            {['Bearer Token', 'JWT Bearer', 'OAuth 2.0'].includes(authType) && (
              <label className="form-field">Token<input type="password" value={authToken} onChange={event => setAuthToken(event.target.value)} /></label>
            )}

            {authType === 'API Key' && (
              <div className="api-key-block">
                <div className="api-key-grid">
                  <label className="form-field">Key<input value={apiKeyName} onChange={event => setApiKeyName(event.target.value)} placeholder="appid" /></label>
                  <label className="form-field">Value<input type="password" value={apiKeyValue} onChange={event => setApiKeyValue(event.target.value)} placeholder="Your API key" /></label>
                  <label className="form-field">Add to
                    <select value={apiKeyTarget} onChange={event => setApiKeyTarget(event.target.value as ApiKeyTarget)}>
                      <option value="query">Query Params</option>
                      <option value="header">Headers</option>
                    </select>
                  </label>
                </div>
                <div className="api-key-actions">
                  <button className="secondary-action" onClick={syncApiKey}>
                    {apiKeyTarget === 'query' ? 'Sync to Params' : 'Sync to Headers'}
                  </button>
                  <span>{apiKeyTarget === 'query' ? 'Sync moves this key to query params and removes the matching header.' : 'Sync moves this key to headers and removes the matching query param.'}</span>
                </div>
              </div>
            )}

            {authType !== 'No Auth' && !['Bearer Token', 'JWT Bearer', 'OAuth 2.0', 'API Key'].includes(authType) && (
              <div className="message error">This auth type is shown to match the design, but only Bearer/OAuth token and API key headers are wired in this pass.</div>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <KeyValueEditor
            addLabel="Add Header"
            keyPlaceholder="Header"
            rows={headers}
            valuePlaceholder="Value"
            onAdd={() => setHeaders([...headers, emptyRow()])}
            onChange={(index, patch) => updateHeader(headers, setHeaders, index, patch)}
            onRemove={id => setHeaders(headers.filter(item => item.id !== id))}
          />
        )}

        {activeTab === 'body' && (
          <label className="form-field body-editor">Raw Body<textarea rows={14} value={body} onChange={event => setBody(event.target.value)} disabled={['GET', 'HEAD'].includes(method)} /></label>
        )}

        {activeTab === 'settings' && <ApiSettingsPanel apiProxyEnabled={capabilities.apiProxyEnabled} settings={settings} transport={transport} onSettingsChange={setSettings} onTransportChange={setTransport} />}
      </section>

      <section className="api-panel response-panel">
        <div className="panel-header"><h2>Response</h2>{response && <span className={response.status > 0 && response.status < 400 ? 'status-pill connected' : 'status-pill'}>{response.status || 'ERR'} {response.statusText}</span>}</div>
        {response ? (
          <>
            <div className="response-meta"><span>{response.timeMs} ms</span><span>{formatBytes(new Blob([response.body]).size)}</span></div>
            <pre className={response.error ? 'response-body error' : 'response-body'}>{prettyBody(response.body)}</pre>
          </>
        ) : <EmptyState title="No response yet" />}
      </section>
    </div>
  );
}

function KeyValueEditor({
  addLabel,
  keyPlaceholder,
  rows,
  valuePlaceholder,
  onAdd,
  onChange,
  onRemove
}: {
  addLabel: string;
  keyPlaceholder: string;
  rows: HeaderRow[];
  valuePlaceholder: string;
  onAdd: () => void;
  onChange: (index: number, patch: Partial<HeaderRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="kv-table">
      <div className="kv-header"><span>{keyPlaceholder}</span><span>{valuePlaceholder}</span><span></span></div>
      {rows.map((row, index) => (
        <div className="kv-row" key={row.id}>
          <input type="checkbox" checked={row.enabled} onChange={event => onChange(index, { enabled: event.target.checked })} />
          <input value={row.key} placeholder={keyPlaceholder} onChange={event => onChange(index, { key: event.target.value })} />
          <input value={row.value} placeholder={valuePlaceholder} onChange={event => onChange(index, { value: event.target.value })} />
          <button className="icon-action" onClick={() => onRemove(row.id)}><Trash2 size={14} /></button>
        </div>
      ))}
      <button className="add-row-button" onClick={onAdd}><Plus size={15} />{addLabel}</button>
    </div>
  );
}

function ApiSettingsPanel({
  apiProxyEnabled,
  settings,
  transport,
  onSettingsChange,
  onTransportChange
}: {
  apiProxyEnabled: boolean;
  settings: ApiSettings;
  transport: Transport;
  onSettingsChange: (settings: ApiSettings) => void;
  onTransportChange: (transport: Transport) => void;
}) {
  const update = (patch: Partial<ApiSettings>) => onSettingsChange({ ...settings, ...patch });

  return (
    <div className="api-settings-panel">
      <SettingRow
        label="Transport"
        description="Choose whether the browser sends the request directly or asks the server proxy to send it."
        defaultText={apiProxyEnabled ? 'Default: Browser fetch' : 'Server proxy disabled'}
        control={
          <select className="compact-select" value={transport} onChange={event => onTransportChange(event.target.value as Transport)}>
            <option value="browser">Browser fetch</option>
            <option value="server" disabled={!apiProxyEnabled}>Server proxy</option>
          </select>
        }
      />
      <SettingRow
        label="HTTP version"
        description="Select the HTTP version to use for sending the request."
        badge="NEW"
        defaultText="Default: Settings"
        control={
          <select className="compact-select" value={settings.httpVersion} onChange={event => update({ httpVersion: event.target.value as ApiSettings['httpVersion'] })}>
            <option value="Auto">Auto</option>
            <option value="HTTP/1">HTTP/1</option>
            <option value="HTTP/1.1">HTTP/1.1</option>
            <option value="HTTP/2">HTTP/2</option>
          </select>
        }
      />
      <SettingRow label="Enable SSL certificate verification" description="Verify SSL certificates when sending a request. Verification failures will result in the request being aborted." defaultText="Default: Settings" control={<Toggle checked={settings.sslVerification} onChange={value => update({ sslVerification: value })} />} />
      <SettingRow label="Automatically follow redirects" description="Follow HTTP 3xx responses as redirects." defaultText="Default: Settings" control={<Toggle checked={settings.followRedirects} onChange={value => update({ followRedirects: value })} />} />
      <SettingRow label="Follow original HTTP Method" description="Redirect with the original HTTP method instead of the default behavior of redirecting with GET." control={<Toggle checked={settings.followOriginalMethod} onChange={value => update({ followOriginalMethod: value })} />} />
      <SettingRow label="Follow Authorization header" description="Retain authorization header when a redirect happens to a different hostname." control={<Toggle checked={settings.followAuthHeader} onChange={value => update({ followAuthHeader: value })} />} />
      <SettingRow label="Remove referer header on redirect" description="Remove the referer header when a redirect happens." control={<Toggle checked={settings.removeRefererOnRedirect} onChange={value => update({ removeRefererOnRedirect: value })} />} />
      <SettingRow label="Enable strict HTTP parser" description="Restrict responses with invalid HTTP headers." control={<Toggle checked={settings.strictHttpParser} onChange={value => update({ strictHttpParser: value })} />} />
      <SettingRow label="Encode URL automatically" description="Encode the URL's path, query parameters, and authentication fields." control={<Toggle checked={settings.encodeUrlAutomatically} onChange={value => update({ encodeUrlAutomatically: value })} />} />
      <SettingRow label="Disable cookie jar" description="Prevent cookies used in this request from being stored in the cookie jar. Existing cookies in the cookie jar will not be added as headers for this request." defaultText="Default: Settings" control={<Toggle checked={settings.disableCookieJar} onChange={value => update({ disableCookieJar: value })} />} />
      <SettingRow label="Use server cipher suite during handshake" description="Use the server's cipher suite order instead of the client's during handshake." control={<Toggle checked={settings.useServerCipherSuite} onChange={value => update({ useServerCipherSuite: value })} />} />
      <SettingRow label="Maximum number of redirects" description="Set a cap on the maximum number of redirects to follow." control={<input className="compact-number" type="number" min={0} value={settings.maxRedirects} onChange={event => update({ maxRedirects: Number(event.target.value) })} />} />
    </div>
  );
}

function SettingRow({ label, description, badge, defaultText, control }: { label: string; description: string; badge?: string; defaultText?: string; control: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <div className="setting-label">{label}{badge && <span className="badge-new">{badge}</span>}</div>
        <p>{description}</p>
      </div>
      <div className="setting-control">
        {control}
        {defaultText && <small>{defaultText}</small>}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className={checked ? 'toggle-switch on' : 'toggle-switch'} onClick={() => onChange(!checked)} type="button">
      <span />
      <strong>{checked ? 'ON' : 'OFF'}</strong>
    </button>
  );
}

function ConfigModal({
  title,
  fields,
  config,
  message,
  primaryLabel,
  secondaryLabel,
  onChange,
  onClose,
  onPrimary,
  onSecondary
}: {
  title: string;
  fields: Field[];
  config: Record<string, string>;
  message: string;
  primaryLabel: string;
  secondaryLabel: string;
  onChange: (config: Record<string, string>) => void;
  onClose: () => void;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  function toggleSecret(key: string) {
    setRevealedSecrets(current => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={event => event.stopPropagation()}>
        <header><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="modal-body">
          {fields.map(field => {
            const isSecretTextarea = field.control === 'textarea' && field.type === 'password';
            const isRevealed = Boolean(revealedSecrets[field.key]);

            return (
              <label className="form-field" key={field.key}>
                {field.label}{field.optional && <span>Optional</span>}
                {field.control === 'textarea'
                  ? (
                    <div className={isSecretTextarea ? 'secret-control' : undefined}>
                      <textarea
                        className={isSecretTextarea && !isRevealed ? 'secret-textarea masked' : 'secret-textarea'}
                        rows={field.key === 'serviceAccount' ? 7 : 4}
                        placeholder={field.placeholder || ''}
                        value={config[field.key] || ''}
                        onChange={event => onChange({ ...config, [field.key]: event.target.value })}
                      />
                      {isSecretTextarea && <button className="secret-toggle" type="button" onClick={() => toggleSecret(field.key)}>{isRevealed ? 'Hide Secret' : 'Show Secret'}</button>}
                    </div>
                  )
                  : <input type={field.type || 'text'} placeholder={field.placeholder || ''} value={config[field.key] || ''} onChange={event => onChange({ ...config, [field.key]: event.target.value })} />}
              </label>
            );
          })}
          {message && <div className={message.includes('Missing') || message.includes('failed') || message.includes('returned') || message.includes('not enabled') ? 'message error' : 'message success'}>{message}</div>}
        </div>
        <footer><button className="secondary-action" onClick={onSecondary}>{secondaryLabel}</button><button className="primary-action" onClick={onPrimary}>{primaryLabel}</button></footer>
      </section>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function SummaryItem({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return <div className="summary-item">{icon}<div><strong>{value}</strong><span>{label}</span></div></div>;
}

function EmptyState({ title }: { title: string }) {
  return <div className="empty-state"><FolderOpen size={32} /><h2>{title}</h2></div>;
}

function readStoredAuthToken() {
  try {
    return window.sessionStorage.getItem(authStorageKey) || '';
  } catch {
    return '';
  }
}

function storeAuthToken(token: string) {
  try {
    window.sessionStorage.setItem(authStorageKey, token);
  } catch {
    // Session storage can be unavailable in restrictive browser modes.
  }
}

function clearStoredAuthToken() {
  try {
    window.sessionStorage.removeItem(authStorageKey);
  } catch {
    // Session storage can be unavailable in restrictive browser modes.
  }
}

function appAuthHeaders(token: string, headers: Record<string, string> = {}) {
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

function normalizeAuthStatus(value: Partial<AuthStatus>): AuthStatus {
  const required = value.required !== false;
  return {
    required,
    configured: Boolean(value.configured),
    authenticated: !required || Boolean(value.authenticated),
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined
  };
}

function updateHeader(headers: HeaderRow[], setHeaders: (headers: HeaderRow[]) => void, index: number, patch: Partial<HeaderRow>) {
  setHeaders(headers.map((header, idx) => idx === index ? { ...header, ...patch } : header));
}

function emptyRow(): HeaderRow {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true };
}

function buildRequestUrl(baseUrl: string, rows: HeaderRow[], apiKey?: { key: string; value: string }) {
  const queryRows = rows.filter(row => row.enabled && row.key.trim());
  if (apiKey?.key.trim() && apiKey.value.trim()) {
    const key = apiKey.key.trim();
    const existingIndex = queryRows.findIndex(row => row.key.trim().toLowerCase() === key.toLowerCase());
    const nextRow = { id: 'authorization-api-key', key, value: apiKey.value, enabled: true };
    if (existingIndex === -1) {
      queryRows.push(nextRow);
    } else {
      queryRows[existingIndex] = nextRow;
    }
  }

  if (queryRows.length === 0) return baseUrl;

  try {
    const next = new URL(baseUrl);
    queryRows.forEach(row => next.searchParams.set(row.key.trim(), row.value));
    return next.toString();
  } catch {
    const [rawBase, rawQuery = ''] = baseUrl.split('?');
    const next = new URLSearchParams(rawQuery);
    queryRows.forEach(row => next.set(row.key.trim(), row.value));
    const query = next.toString();
    return query ? `${rawBase}?${query}` : rawBase;
  }
}

function splitUrlParams(value: string) {
  try {
    const parsed = new URL(value);
    const params = Array.from(parsed.searchParams.entries()).map(([key, paramValue]) => ({
      id: crypto.randomUUID(),
      key,
      value: paramValue,
      enabled: true
    }));
    parsed.search = '';
    return { baseUrl: parsed.toString(), params };
  } catch {
    const queryStart = value.indexOf('?');
    if (queryStart === -1) return { baseUrl: value, params: [] };

    const rawBase = value.slice(0, queryStart);
    const rawQuery = value.slice(queryStart + 1);
    const params = Array.from(new URLSearchParams(rawQuery).entries()).map(([key, paramValue]) => ({
      id: crypto.randomUUID(),
      key,
      value: paramValue,
      enabled: true
    }));
    return { baseUrl: rawBase, params };
  }
}

function upsertRow(rows: HeaderRow[], key: string, value: string) {
  const normalizedKey = key.trim().toLowerCase();
  const existingIndex = rows.findIndex(row => row.key.trim().toLowerCase() === normalizedKey);
  if (existingIndex === -1) {
    return [...rows, { id: crypto.randomUUID(), key, value, enabled: true }];
  }

  return rows.map((row, index) => index === existingIndex ? { ...row, key, value, enabled: true } : row);
}

function removeRowByKey(rows: HeaderRow[], key: string) {
  const normalizedKey = key.trim().toLowerCase();
  return rows.filter(row => row.key.trim().toLowerCase() !== normalizedKey);
}

function idleResult(): FileResult {
  return { status: 'idle', files: [], message: 'No live listing yet.' };
}

function missingRequiredFields(connection: FileConnection, config: Record<string, string>) {
  return fieldsByType[connection.type]
    .filter(field => !field.optional && !String(config[field.key] || '').trim())
    .map(field => field.label);
}

function sourceLocation(connection: FileConnection) {
  const config = connection.config;
  switch (connection.type) {
    case 's3': return `s3://${config.bucket || 'bucket'}/${config.pathPrefix || ''}`;
    case 'gcs': return `gs://${config.bucket || 'bucket'}/${config.pathPrefix || ''}`;
    case 'azure': return `azure://${config.account || 'account'}/${config.container || 'container'}/${config.pathPrefix || ''}`;
    case 'sftp': return `${config.host || 'host'}:${config.baseDir || '/'}`;
    case 'local': return config.mountPath || '/mnt/source';
  }
}

async function profileFilesForCsv(
  token: string,
  connection: FileConnection,
  files: FileMetadata[],
  onUnauthorized: () => void
) {
  const profiles = await mapWithConcurrency(files, 4, async file => {
    try {
      const response = await fetch('/api/files/profile', {
        method: 'POST',
        headers: appAuthHeaders(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({
          type: connection.type,
          config: connection.config,
          file: {
            name: file.name,
            path: file.path,
            kind: file.kind,
            sizeBytes: file.sizeBytes
          }
        })
      });
      const body = await response.json();
      if (response.status === 401) {
        onUnauthorized();
        throw new UnauthorizedError('Your session expired. Sign in again before exporting profiles.');
      }
      if (!response.ok || body.error) throw new Error(body.error || `Request failed with ${response.status}`);
      return normalizeFileProfile(file, body);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      return fileProfileError(file, error instanceof Error ? error.message : 'Unable to profile file');
    }
  });

  return new Map(profiles.map(profile => [profile.filePath, profile]));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

function normalizeFileProfile(file: FileMetadata, value: Partial<FileProfile>): FileProfile {
  return {
    filePath: String(value.filePath || file.path),
    rowCount: value.rowCount ?? 'not_profiled',
    sourceSchemaJson: isRecord(value.sourceSchemaJson) ? stringifyRecordValues(value.sourceSchemaJson) : {},
    primaryKeyCandidate: String(value.primaryKeyCandidate || 'none'),
    identityCandidate: Boolean(value.identityCandidate),
    nullableColumnCount: value.nullableColumnCount ?? 'not_profiled',
    profilingStatus: String(value.profilingStatus || 'profiled')
  };
}

function fileProfileError(file: FileMetadata, message: string): FileProfile {
  return {
    filePath: file.path,
    rowCount: 'not_profiled',
    sourceSchemaJson: {},
    primaryKeyCandidate: 'none',
    identityCandidate: false,
    nullableColumnCount: 'not_profiled',
    profilingStatus: `profile_error: ${message}`
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringifyRecordValues(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, String(entry)]));
}

class UnauthorizedError extends Error {}

function buildInventoryCsv(connection: FileConnection, result: FileResult, source: string, profiles = new Map<string, FileProfile>()) {
  const headers = [
    'source_name',
    'source_type',
    'source_location',
    'file_name',
    'file_path',
    'file_kind',
    'size_bytes',
    'modified_at',
    'owner',
    'storage_class',
    'encrypted',
    'row_count',
    'source_schema_json',
    'primary_key_candidate',
    'identity_candidate',
    'nullable_column_count',
    'profiling_status'
  ];

  const rows = result.files.map(file => {
    const profile = profiles.get(file.path);
    return [
      connection.name,
      connection.type,
      source,
      file.name,
      file.path,
      file.kind,
      file.sizeBytes,
      file.modifiedAt,
      file.owner,
      file.storageClass,
      file.encrypted,
      profile?.rowCount ?? file.rows ?? 'not_profiled',
      profile ? JSON.stringify(profile.sourceSchemaJson) : '{}',
      profile?.primaryKeyCandidate ?? 'not_profiled',
      profile ? String(profile.identityCandidate) : 'false',
      profile?.nullableColumnCount ?? 'not_profiled',
      profile?.profilingStatus ?? 'metadata_only'
    ];
  });

  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = value == null ? '' : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob(['\uFEFF', content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function inventoryFileName(connection: FileConnection) {
  const safeName = connection.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || connection.type;
  const date = new Date().toISOString().slice(0, 10);
  return `ez-connect-${safeName}-inventory-${date}.csv`;
}

function dbStatusLabel(status: DbConnectionStatus) {
  switch (status) {
    case 'connected': return 'Connected';
    case 'saved': return 'Saved';
    case 'error': return 'Needs Attention';
    case 'disconnected': return 'Not Connected';
  }
}

function dbStatusClass(status: DbConnectionStatus) {
  switch (status) {
    case 'connected': return 'connected';
    case 'saved': return 'saved';
    case 'error': return 'error';
    case 'disconnected': return '';
  }
}

function databaseCardMessage(connection: DbConnection) {
  if (connection.message) return connection.message;
  if (['postgres', 'mysql', 'mssql'].includes(connection.type)) {
    return 'Use Save & Test to validate credentials and reachability.';
  }
  return 'Live testing is not enabled for this provider yet. Save Only keeps local fields without marking it connected.';
}

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function prettyBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export default App;
