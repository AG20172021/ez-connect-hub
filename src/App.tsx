import { useState } from 'react';
import { Check, Database, FileText, FolderOpen, Globe, HardDrive, RefreshCw, Settings, ShieldCheck, X, Zap } from 'lucide-react';

type Section = 'files' | 'database' | 'api';
type ConnectorType = 's3' | 'gcs' | 'azure' | 'sftp' | 'local';
type Status = 'connected' | 'disconnected';

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'number';
  placeholder?: string;
};

type Connection = {
  id: string;
  type: ConnectorType;
  name: string;
  status: Status;
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

const connectorTemplates: Connection[] = [
  { id: 's3', type: 's3', name: 'Amazon S3', status: 'connected', color: '#FF9900', icon: 'S3', config: { region: 'us-east-1', bucket: 'my-data-bucket', accessKey: 'saved', secretKey: 'saved' } },
  { id: 'gcs', type: 'gcs', name: 'Google Cloud Storage', status: 'disconnected', color: '#4285F4', icon: 'GCS', config: {} },
  { id: 'azure', type: 'azure', name: 'Azure Blob Storage', status: 'disconnected', color: '#0078D4', icon: 'AZ', config: {} },
  { id: 'sftp', type: 'sftp', name: 'SFTP', status: 'disconnected', color: '#4A5568', icon: 'SFTP', config: {} },
  { id: 'local', type: 'local', name: 'Local / NFS', status: 'disconnected', color: '#718096', icon: 'LOC', config: {} }
];

const fieldsByType: Record<ConnectorType, Field[]> = {
  s3: [
    { key: 'region', label: 'AWS Region', placeholder: 'us-east-1' },
    { key: 'bucket', label: 'Bucket Name', placeholder: 'analytics-landing' },
    { key: 'accessKey', label: 'Access Key ID' },
    { key: 'secretKey', label: 'Secret Access Key', type: 'password' },
    { key: 'pathPrefix', label: 'Path Prefix', placeholder: 'landing/' }
  ],
  gcs: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'bucket', label: 'Bucket Name' },
    { key: 'serviceAccount', label: 'Service Account JSON' },
    { key: 'pathPrefix', label: 'Path Prefix' }
  ],
  azure: [
    { key: 'account', label: 'Storage Account Name' },
    { key: 'container', label: 'Container Name' },
    { key: 'connectionString', label: 'Connection String', type: 'password' },
    { key: 'pathPrefix', label: 'Path Prefix' }
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
    { key: 'filePattern', label: 'File Pattern', placeholder: '*.csv, *.json' }
  ]
};

const requiredFields: Record<ConnectorType, string[]> = {
  s3: ['region', 'bucket', 'accessKey', 'secretKey'],
  gcs: ['projectId', 'bucket', 'serviceAccount'],
  azure: ['account', 'container', 'connectionString'],
  sftp: ['host', 'port', 'username', 'password', 'baseDir'],
  local: ['mountPath']
};

const inventorySeed: FileMetadata[] = [
  { id: 'customers', name: 'customer_daily.csv', path: 'landing/customers/customer_daily.csv', kind: 'CSV', sizeBytes: 28442120, modifiedAt: '2026-06-30T08:14:00.000Z', owner: 'data-ingest', storageClass: 'Standard', encrypted: true, rows: 124908 },
  { id: 'orders', name: 'orders_2026_06_29.parquet', path: 'curated/orders/date=2026-06-29/orders.parquet', kind: 'Parquet', sizeBytes: 113928044, modifiedAt: '2026-06-30T03:02:00.000Z', owner: 'pipeline-runner', storageClass: 'Standard', encrypted: true, rows: 712441 },
  { id: 'inventory', name: 'inventory_snapshot.json', path: 'raw/inventory/inventory_snapshot.json', kind: 'JSON', sizeBytes: 4842118, modifiedAt: '2026-06-29T22:48:00.000Z', owner: 'warehouse-sync', storageClass: 'Nearline', encrypted: true }
];

function App() {
  const [activeSection, setActiveSection] = useState<Section>('files');
  const [connections, setConnections] = useState<Connection[]>(connectorTemplates);
  const [selectedId, setSelectedId] = useState('s3');
  const [editing, setEditing] = useState<Connection | null>(null);
  const [draftConfig, setDraftConfig] = useState<Record<string, string>>({});
  const [testMessage, setTestMessage] = useState('');

  const connectedSources = connections.filter(connection => connection.status === 'connected');
  const selectedSource = connectedSources.find(connection => connection.id === selectedId) || connectedSources[0];
  const inventory = selectedSource ? getInventory(selectedSource) : [];
  const totalSize = inventory.reduce((total, file) => total + file.sizeBytes, 0);
  const latestModified = inventory[0]?.modifiedAt;

  function openEditor(connection: Connection) {
    setEditing(connection);
    setDraftConfig(connection.config);
    setTestMessage('');
  }

  function missingFields(connection: Connection) {
    return requiredFields[connection.type].filter(key => !String(draftConfig[key] || '').trim());
  }

  function testConnection() {
    if (!editing) return;
    const missing = missingFields(editing);
    setTestMessage(missing.length ? `Missing: ${labelsFor(editing, missing).join(', ')}` : 'Connection details are complete.');
  }

  function saveConnection() {
    if (!editing) return;
    const missing = missingFields(editing);
    if (missing.length) {
      setTestMessage(`Missing: ${labelsFor(editing, missing).join(', ')}`);
      return;
    }

    setConnections(current => current.map(connection => connection.id === editing.id ? { ...connection, status: 'connected', config: draftConfig } : connection));
    setSelectedId(editing.id);
    setEditing(null);
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
          <>
            <header className="section-header">
              <div>
                <h1>File Connections</h1>
                <p>Connect to source systems and inspect file metadata.</p>
              </div>
              <button className="secondary-action" disabled={!selectedSource}><RefreshCw size={15} />Refresh</button>
            </header>

            <div className="connector-grid">
              {connections.map(connection => (
                <article className="connector-card" key={connection.id}>
                  <div className="connector-topline">
                    <span className="connector-icon" style={{ backgroundColor: `${connection.color}20`, color: connection.color }}>{connection.icon}</span>
                    <span className={`status-pill ${connection.status}`}>{connection.status === 'connected' && <Check size={12} />}{connection.status === 'connected' ? 'Connected' : 'Not Connected'}</span>
                  </div>
                  <h2>{connection.name}</h2>
                  <button className="configure-button" onClick={() => openEditor(connection)}><Settings size={14} />{connection.status === 'connected' ? 'Configure' : 'Connect'}</button>
                </article>
              ))}
            </div>

            <section className="inventory-panel">
              <div className="inventory-heading">
                <div><span className="eyebrow">File Visibility</span><h2>Source file inventory</h2></div>
                {selectedSource && <span className="source-location">{sourceLocation(selectedSource)}</span>}
              </div>

              {selectedSource ? (
                <>
                  <div className="source-tabs">
                    {connectedSources.map(connection => <button key={connection.id} className={connection.id === selectedSource.id ? 'active' : ''} onClick={() => setSelectedId(connection.id)}>{connection.name}</button>)}
                  </div>

                  <div className="summary-grid">
                    <SummaryItem icon={<FileText size={18} />} value={String(inventory.length)} label="Files found" />
                    <SummaryItem icon={<HardDrive size={18} />} value={formatBytes(totalSize)} label="Total size" />
                    <SummaryItem icon={<ShieldCheck size={18} />} value={inventory.every(file => file.encrypted) ? 'Encrypted' : 'Mixed'} label="Protection" />
                    <SummaryItem icon={<RefreshCw size={18} />} value={latestModified ? formatDate(latestModified) : '-'} label="Latest update" />
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Modified</th><th>Owner</th><th>Storage</th><th>Rows</th></tr></thead>
                      <tbody>
                        {inventory.map(file => (
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
                </>
              ) : <div className="empty-state"><FolderOpen size={32} /><h2>No connected file sources</h2></div>}
            </section>
          </>
        )}

        {activeSection === 'database' && <Placeholder title="Database Connections" />}
        {activeSection === 'api' && <Placeholder title="API Connections" />}
      </main>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <section className="modal" onClick={event => event.stopPropagation()}>
            <header><h2>Configure {editing.name}</h2><button onClick={() => setEditing(null)} aria-label="Close"><X size={18} /></button></header>
            <div className="modal-body">
              {fieldsByType[editing.type].map(field => (
                <label className="form-field" key={field.key}>{field.label}<input type={field.type || 'text'} placeholder={field.placeholder || ''} value={draftConfig[field.key] || ''} onChange={event => { setDraftConfig({ ...draftConfig, [field.key]: event.target.value }); setTestMessage(''); }} /></label>
              ))}
              {testMessage && <div className={testMessage.startsWith('Missing') ? 'message error' : 'message success'}>{testMessage}</div>}
            </div>
            <footer><button className="secondary-action" onClick={testConnection}>Test Connection</button><button className="primary-action" onClick={saveConnection}>Save & View Files</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function SummaryItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="summary-item">{icon}<div><strong>{value}</strong><span>{label}</span></div></div>;
}

function Placeholder({ title }: { title: string }) {
  return <section className="placeholder"><h1>{title}</h1><p>File source visibility is ready first.</p></section>;
}

function labelsFor(connection: Connection, keys: string[]) {
  return keys.map(key => fieldsByType[connection.type].find(field => field.key === key)?.label || key);
}

function getInventory(connection: Connection) {
  const location = sourceLocation(connection).replace(/\/$/, '');
  return inventorySeed.map(file => ({ ...file, id: `${connection.id}-${file.id}`, path: `${location}/${file.path}`.replace(/([^:]\/)\/+/g, '$1') }));
}

function sourceLocation(connection: Connection) {
  const config = connection.config;
  switch (connection.type) {
    case 's3': return `s3://${config.bucket || 'bucket'}/${config.pathPrefix || ''}`;
    case 'gcs': return `gs://${config.bucket || 'bucket'}/${config.pathPrefix || ''}`;
    case 'azure': return `${config.account || 'account'}/${config.container || 'container'}/${config.pathPrefix || ''}`;
    case 'sftp': return `${config.host || 'host'}:${config.baseDir || '/'}`;
    case 'local': return config.mountPath || '/mnt/source';
  }
}

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default App;
