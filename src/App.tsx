import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Database, FileText, FolderOpen, Globe, HardDrive, Plus, RefreshCw, Send, Settings, ShieldCheck, Trash2, X, Zap } from 'lucide-react';

type Section = 'files' | 'database' | 'api';
type ConnectorType = 's3' | 'gcs' | 'azure' | 'sftp' | 'local';
type ConnectionStatus = 'connected' | 'disconnected';
type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

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
};

type DbConnection = {
  id: string;
  name: string;
  color: string;
  icon: string;
  config: Record<string, string>;
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

const fileConnectors: FileConnection[] = [
  { id: 's3', type: 's3', name: 'Amazon S3', status: 'disconnected', color: '#FF9900', icon: 'S3', config: {} },
  { id: 'gcs', type: 'gcs', name: 'Google Cloud Storage', status: 'disconnected', color: '#4285F4', icon: 'GCS', config: {} },
  { id: 'azure', type: 'azure', name: 'Azure Blob Storage', status: 'disconnected', color: '#0078D4', icon: 'AZ', config: {} },
  { id: 'sftp', type: 'sftp', name: 'SFTP', status: 'disconnected', color: '#4A5568', icon: 'SFTP', config: {} },
  { id: 'local', type: 'local', name: 'Local / NFS', status: 'disconnected', color: '#718096', icon: 'LOC', config: {} }
];

const dbConnectors: DbConnection[] = [
  { id: 'postgres', name: 'PostgreSQL', color: '#336791', icon: 'PG', config: {} },
  { id: 'mysql', name: 'MySQL', color: '#00618A', icon: 'SQL', config: {} },
  { id: 'mssql', name: 'SQL Server', color: '#CC2927', icon: 'MS', config: {} },
  { id: 'snowflake', name: 'Snowflake', color: '#29B5E8', icon: 'SF', config: {} },
  { id: 'bigquery', name: 'BigQuery', color: '#4285F4', icon: 'BQ', config: {} }
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
    { key: 'serviceAccount', label: 'Service Account JSON', control: 'textarea' },
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

const dbFields: Field[] = [
  { key: 'host', label: 'Host' },
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'database', label: 'Database' },
  { key: 'username', label: 'Username' },
  { key: 'password', label: 'Password', type: 'password' },
  { key: 'sslMode', label: 'SSL Mode', placeholder: 'require', optional: true }
];

const methods: RequestMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

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

  const selectedSource = connections.find(connection => connection.id === selectedId) || connections[0];
  const selectedResult = fileResults[selectedSource.id] || idleResult();
  const connectedSources = connections.filter(connection => connection.status === 'connected');
  const totalSize = selectedResult.files.reduce((total, file) => total + file.sizeBytes, 0);

  function openFileEditor(connection: FileConnection) {
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: connection.type, config })
      });
      const body = await response.json();
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

  function saveDbConnection() {
    if (!editingDb) return;
    const missing = dbFields.filter(field => !field.optional && !draftConfig[field.key]?.trim()).map(field => field.label);
    if (missing.length) {
      setModalMessage(`Missing: ${missing.join(', ')}`);
      return;
    }

    setDbConnections(current => current.map(connection => connection.id === editingDb.id ? { ...connection, config: draftConfig } : connection));
    setModalMessage('Database configuration saved. Driver-backed testing is not enabled yet.');
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
          />
        )}

        {activeSection === 'database' && <DatabasePage connections={dbConnections} onConfigure={openDbEditor} />}
        {activeSection === 'api' && <ApiPage />}
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
          fields={dbFields}
          config={draftConfig}
          message={modalMessage || 'Configuration is saved locally in this browser session. Live DB testing needs backend drivers and network access.'}
          primaryLabel="Save Config"
          secondaryLabel="Close"
          onChange={setDraftConfig}
          onClose={closeModal}
          onPrimary={saveDbConnection}
          onSecondary={closeModal}
        />
      )}
    </div>
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
  onSelect
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
}) {
  const latestModified = selectedResult.files[0]?.modifiedAt;

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
          return (
            <article className="connector-card" key={connection.id}>
              <div className="connector-topline">
                <span className="connector-icon" style={{ backgroundColor: `${connection.color}20`, color: connection.color }}>{connection.icon}</span>
                <span className={`status-pill ${connection.status}`}>{connection.status === 'connected' && <Check size={12} />}{connection.status === 'connected' ? 'Connected' : 'Not Connected'}</span>
              </div>
              <h2>{connection.name}</h2>
              <p className={result.status === 'error' ? 'card-error' : 'card-muted'}>{result.status === 'idle' ? 'No live listing yet.' : result.message}</p>
              <button className="configure-button" onClick={() => onConfigure(connection)}><Settings size={14} />{connection.status === 'connected' ? 'Configure' : 'Connect'}</button>
            </article>
          );
        })}
      </div>

      <section className="inventory-panel">
        <div className="inventory-heading">
          <div><span className="eyebrow">File Visibility</span><h2>Source file inventory</h2></div>
          <span className="source-location">{selectedResult.source || sourceLocation(selectedSource)}</span>
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
          <p>Save database connection details for the next backend driver pass.</p>
        </div>
      </header>
      <div className="connector-grid">
        {connections.map(connection => (
          <article className="connector-card" key={connection.id}>
            <div className="connector-topline">
              <span className="connector-icon" style={{ backgroundColor: `${connection.color}20`, color: connection.color }}>{connection.icon}</span>
              <span className="status-pill">{Object.keys(connection.config).length ? 'Configured' : 'Not Connected'}</span>
            </div>
            <h2>{connection.name}</h2>
            <p className="card-muted">Driver-backed testing is not enabled yet.</p>
            <button className="configure-button" onClick={() => onConfigure(connection)}><Settings size={14} />Configure</button>
          </article>
        ))}
      </div>
    </>
  );
}

function ApiPage() {
  const [method, setMethod] = useState<RequestMethod>('GET');
  const [url, setUrl] = useState('https://api.github.com/repos/AG20172021/ez-connect-hub');
  const [headers, setHeaders] = useState<HeaderRow[]>([{ id: 'content-type', key: 'Accept', value: 'application/json', enabled: true }]);
  const [body, setBody] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [transport, setTransport] = useState<'browser' | 'server'>('browser');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  const headerObject = useMemo(() => {
    const next: Record<string, string> = {};
    headers.filter(header => header.enabled && header.key.trim()).forEach(header => {
      next[header.key.trim()] = header.value;
    });
    if (authToken.trim()) next.Authorization = `Bearer ${authToken.trim()}`;
    return next;
  }, [authToken, headers]);

  async function sendRequest() {
    setSending(true);
    const started = performance.now();
    try {
      if (transport === 'server') {
        const res = await fetch('/api/http/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method, url, headers: headerObject, body })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `Request failed with ${res.status}`);
        setResponse({ ...data, timeMs: data.timeMs || Math.round(performance.now() - started) });
      } else {
        const res = await fetch(url, {
          method,
          headers: headerObject,
          body: ['GET', 'HEAD'].includes(method) ? undefined : body
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
        <select value={method} onChange={event => setMethod(event.target.value as RequestMethod)}>
          {methods.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://api.example.com/resource" />
        <button className="primary-action" disabled={sending || !url.trim()} onClick={() => void sendRequest()}><Send size={15} />{sending ? 'Sending...' : 'Send'}</button>
      </header>

      <div className="api-grid">
        <section className="api-panel">
          <div className="panel-header"><h2>Request</h2></div>
          <label className="form-field">Transport
            <select value={transport} onChange={event => setTransport(event.target.value as 'browser' | 'server')}>
              <option value="browser">Browser fetch</option>
              <option value="server">Server proxy</option>
            </select>
          </label>
          <label className="form-field">Bearer Token<input type="password" value={authToken} onChange={event => setAuthToken(event.target.value)} /></label>

          <div className="kv-header"><span>Headers</span><button className="icon-action" onClick={() => setHeaders([...headers, { id: crypto.randomUUID(), key: '', value: '', enabled: true }])}><Plus size={15} /></button></div>
          {headers.map((header, index) => (
            <div className="kv-row" key={header.id}>
              <input type="checkbox" checked={header.enabled} onChange={event => updateHeader(headers, setHeaders, index, { enabled: event.target.checked })} />
              <input value={header.key} placeholder="Header" onChange={event => updateHeader(headers, setHeaders, index, { key: event.target.value })} />
              <input value={header.value} placeholder="Value" onChange={event => updateHeader(headers, setHeaders, index, { value: event.target.value })} />
              <button className="icon-action" onClick={() => setHeaders(headers.filter(item => item.id !== header.id))}><Trash2 size={14} /></button>
            </div>
          ))}

          {!['GET', 'HEAD'].includes(method) && <label className="form-field">Body<textarea rows={10} value={body} onChange={event => setBody(event.target.value)} /></label>}
        </section>

        <section className="api-panel">
          <div className="panel-header"><h2>Response</h2>{response && <span className={response.status > 0 && response.status < 400 ? 'status-pill connected' : 'status-pill'}>{response.status || 'ERR'} {response.statusText}</span>}</div>
          {response ? (
            <>
              <div className="response-meta"><span>{response.timeMs} ms</span><span>{formatBytes(new Blob([response.body]).size)}</span></div>
              <pre className={response.error ? 'response-body error' : 'response-body'}>{prettyBody(response.body)}</pre>
            </>
          ) : <EmptyState title="No response yet" />}
        </section>
      </div>
    </div>
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={event => event.stopPropagation()}>
        <header><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="modal-body">
          {fields.map(field => (
            <label className="form-field" key={field.key}>
              {field.label}{field.optional && <span>Optional</span>}
              {field.control === 'textarea'
                ? <textarea rows={field.key === 'serviceAccount' ? 7 : 4} placeholder={field.placeholder || ''} value={config[field.key] || ''} onChange={event => onChange({ ...config, [field.key]: event.target.value })} />
                : <input type={field.type || 'text'} placeholder={field.placeholder || ''} value={config[field.key] || ''} onChange={event => onChange({ ...config, [field.key]: event.target.value })} />}
            </label>
          ))}
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

function updateHeader(headers: HeaderRow[], setHeaders: (headers: HeaderRow[]) => void, index: number, patch: Partial<HeaderRow>) {
  setHeaders(headers.map((header, idx) => idx === index ? { ...header, ...patch } : header));
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
