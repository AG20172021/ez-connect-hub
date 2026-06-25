import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { FileConnection, DbConnection, FileConnectorType, DbConnectorType } from '../types';

interface ConnectionModalProps {
  connection: FileConnection | DbConnection | null;
  type: 'file' | 'database';
  onClose: () => void;
  onSave: (connection: FileConnection | DbConnection) => void;
}

const awsRegions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1',
  'ca-central-1', 'sa-east-1'
];

const sslModes = ['disable', 'require', 'verify-ca', 'verify-full'];

const sqlAuthMethods = ['SQL Login', 'Windows Auth', 'Azure AD'];

const bigQueryLocations = ['US', 'EU', 'asia-northeast1', 'asia-southeast1', 'europe-west1', 'us-central1'];

export function ConnectionModal({ connection, type, onClose, onSave }: ConnectionModalProps) {
  const [config, setConfig] = useState<Record<string, string | boolean | number>>({});
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [authMethod, setAuthMethod] = useState('password');
  const [sshTunnel, setSshTunnel] = useState(false);

  useEffect(() => {
    if (connection) {
      setConfig(connection.config || {});
      if (connection.type === 'snowflake') {
        setAuthMethod((connection.config.authMethod as string) || 'password');
      }
      if (connection.type === 'sftp') {
        setAuthMethod((connection.config.authMethod as string) || 'password');
      }
    }
  }, [connection]);

  if (!connection) return null;

  const handleTest = () => {
    setTestStatus('testing');
    setTestMessage('');
    setTimeout(() => {
      const success = Math.random() > 0.3;
      setTestStatus(success ? 'success' : 'error');
      setTestMessage(success ? 'Connection successful' : 'Could not connect: timeout');
    }, 1500);
  };

  const handleSave = () => {
    onSave({ ...connection, config });
  };

  const updateConfig = (key: string, value: string | boolean | number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const renderFileFields = () => {
    const c = connection as FileConnection;
    switch (c.type) {
      case 's3':
        return (
          <>
            <div className="form-group">
              <label>AWS Region</label>
              <select value={(config.region as string) || ''} onChange={e => updateConfig('region', e.target.value)}>
                <option value="">Select region</option>
                {awsRegions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Bucket Name</label><input type="text" value={(config.bucket as string) || ''} onChange={e => updateConfig('bucket', e.target.value)} /></div>
            <div className="form-group"><label>Access Key ID</label><input type="text" value={(config.accessKey as string) || ''} onChange={e => updateConfig('accessKey', e.target.value)} /></div>
            <div className="form-group"><label>Secret Access Key</label><input type="password" value={(config.secretKey as string) || ''} onChange={e => updateConfig('secretKey', e.target.value)} /></div>
            <div className="form-group"><label>Endpoint URL (optional)</label><input type="text" placeholder="https://s3-compatible.example.com" value={(config.endpoint as string) || ''} onChange={e => updateConfig('endpoint', e.target.value)} /></div>
            <div className="form-group"><label>Path Prefix (optional)</label><input type="text" value={(config.pathPrefix as string) || ''} onChange={e => updateConfig('pathPrefix', e.target.value)} /></div>
          </>
        );
      case 'gcs':
        return (
          <>
            <div className="form-group"><label>Project ID</label><input type="text" value={(config.projectId as string) || ''} onChange={e => updateConfig('projectId', e.target.value)} /></div>
            <div className="form-group"><label>Bucket Name</label><input type="text" value={(config.bucket as string) || ''} onChange={e => updateConfig('bucket', e.target.value)} /></div>
            <div className="form-group"><label>Service Account JSON</label><textarea rows={4} value={(config.serviceAccount as string) || ''} onChange={e => updateConfig('serviceAccount', e.target.value)} /></div>
            <div className="form-group"><label>Path Prefix (optional)</label><input type="text" value={(config.pathPrefix as string) || ''} onChange={e => updateConfig('pathPrefix', e.target.value)} /></div>
          </>
        );
      case 'azure':
        return (
          <>
            <div className="form-group"><label>Storage Account Name</label><input type="text" value={(config.account as string) || ''} onChange={e => updateConfig('account', e.target.value)} /></div>
            <div className="form-group"><label>Container Name</label><input type="text" value={(config.container as string) || ''} onChange={e => updateConfig('container', e.target.value)} /></div>
            <div className="form-group"><label>Connection String</label><textarea rows={3} value={(config.connectionString as string) || ''} onChange={e => updateConfig('connectionString', e.target.value)} /></div>
            <div className="form-group"><label>Path Prefix (optional)</label><input type="text" value={(config.pathPrefix as string) || ''} onChange={e => updateConfig('pathPrefix', e.target.value)} /></div>
          </>
        );
      case 'sftp':
        return (
          <>
            <div className="form-group"><label>Host</label><input type="text" value={(config.host as string) || ''} onChange={e => updateConfig('host', e.target.value)} /></div>
            <div className="form-group"><label>Port</label><input type="number" defaultValue={22} value={(config.port as number) || 22} onChange={e => updateConfig('port', parseInt(e.target.value))} /></div>
            <div className="form-group"><label>Username</label><input type="text" value={(config.username as string) || ''} onChange={e => updateConfig('username', e.target.value)} /></div>
            <div className="form-group">
              <label>Authentication Method</label>
              <div className="radio-group">
                <label className="radio-label"><input type="radio" checked={authMethod === 'password'} onChange={() => { setAuthMethod('password'); updateConfig('authMethod', 'password'); }} /> Password</label>
                <label className="radio-label"><input type="radio" checked={authMethod === 'privateKey'} onChange={() => { setAuthMethod('privateKey'); updateConfig('authMethod', 'privateKey'); }} /> Private Key</label>
              </div>
            </div>
            {authMethod === 'password' ? (
              <div className="form-group"><label>Password</label><input type="password" value={(config.password as string) || ''} onChange={e => updateConfig('password', e.target.value)} /></div>
            ) : (
              <>
                <div className="form-group"><label>Private Key</label><textarea rows={4} value={(config.privateKey as string) || ''} onChange={e => updateConfig('privateKey', e.target.value)} /></div>
                <div className="form-group"><label>Passphrase (optional)</label><input type="password" value={(config.passphrase as string) || ''} onChange={e => updateConfig('passphrase', e.target.value)} /></div>
              </>
            )}
            <div className="form-group"><label>Base Directory</label><input type="text" value={(config.baseDir as string) || ''} onChange={e => updateConfig('baseDir', e.target.value)} /></div>
          </>
        );
      case 'local':
        return (
          <>
            <div className="form-group"><label>Mount Path</label><input type="text" value={(config.mountPath as string) || ''} onChange={e => updateConfig('mountPath', e.target.value)} /></div>
            <div className="form-group checkbox"><label><input type="checkbox" checked={(config.readOnly as boolean) || false} onChange={e => updateConfig('readOnly', e.target.checked)} /> Read-only</label></div>
            <div className="form-group"><label>File Pattern (optional)</label><input type="text" placeholder="*.csv, *.json" value={(config.filePattern as string) || ''} onChange={e => updateConfig('filePattern', e.target.value)} /></div>
          </>
        );
    }
  };

  const renderDbFields = () => {
    const c = connection as DbConnection;
    switch (c.type) {
      case 'postgres':
        return (
          <>
            <div className="form-group"><label>Host</label><input type="text" value={(config.host as string) || ''} onChange={e => updateConfig('host', e.target.value)} /></div>
            <div className="form-group"><label>Port</label><input type="number" defaultValue={5432} value={(config.port as number) || 5432} onChange={e => updateConfig('port', parseInt(e.target.value))} /></div>
            <div className="form-group"><label>Database Name</label><input type="text" value={(config.database as string) || ''} onChange={e => updateConfig('database', e.target.value)} /></div>
            <div className="form-group"><label>Username</label><input type="text" value={(config.username as string) || ''} onChange={e => updateConfig('username', e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={(config.password as string) || ''} onChange={e => updateConfig('password', e.target.value)} /></div>
            <div className="form-group">
              <label>SSL Mode</label>
              <select value={(config.sslMode as string) || 'require'} onChange={e => updateConfig('sslMode', e.target.value)}>
                {sslModes.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group checkbox"><label><input type="checkbox" checked={sshTunnel} onChange={e => setSshTunnel(e.target.checked)} /> Use SSH Tunnel</label></div>
            {sshTunnel && (
              <>
                <div className="form-group"><label>SSH Host</label><input type="text" value={(config.sshHost as string) || ''} onChange={e => updateConfig('sshHost', e.target.value)} /></div>
                <div className="form-group"><label>SSH Port</label><input type="number" defaultValue={22} value={(config.sshPort as number) || 22} onChange={e => updateConfig('sshPort', parseInt(e.target.value))} /></div>
                <div className="form-group"><label>SSH Username</label><input type="text" value={(config.sshUsername as string) || ''} onChange={e => updateConfig('sshUsername', e.target.value)} /></div>
                <div className="form-group"><label>SSH Private Key</label><textarea rows={3} value={(config.sshKey as string) || ''} onChange={e => updateConfig('sshKey', e.target.value)} /></div>
              </>
            )}
          </>
        );
      case 'mysql':
        return (
          <>
            <div className="form-group"><label>Host</label><input type="text" value={(config.host as string) || ''} onChange={e => updateConfig('host', e.target.value)} /></div>
            <div className="form-group"><label>Port</label><input type="number" defaultValue={3306} value={(config.port as number) || 3306} onChange={e => updateConfig('port', parseInt(e.target.value))} /></div>
            <div className="form-group"><label>Database Name</label><input type="text" value={(config.database as string) || ''} onChange={e => updateConfig('database', e.target.value)} /></div>
            <div className="form-group"><label>Username</label><input type="text" value={(config.username as string) || ''} onChange={e => updateConfig('username', e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={(config.password as string) || ''} onChange={e => updateConfig('password', e.target.value)} /></div>
            <div className="form-group checkbox"><label><input type="checkbox" checked={(config.ssl as boolean) || false} onChange={e => updateConfig('ssl', e.target.checked)} /> Use SSL</label></div>
            <div className="form-group checkbox"><label><input type="checkbox" checked={sshTunnel} onChange={e => setSshTunnel(e.target.checked)} /> Use SSH Tunnel</label></div>
          </>
        );
      case 'mssql':
        return (
          <>
            <div className="form-group"><label>Host</label><input type="text" value={(config.host as string) || ''} onChange={e => updateConfig('host', e.target.value)} /></div>
            <div className="form-group"><label>Port</label><input type="number" defaultValue={1433} value={(config.port as number) || 1433} onChange={e => updateConfig('port', parseInt(e.target.value))} /></div>
            <div className="form-group"><label>Database Name</label><input type="text" value={(config.database as string) || ''} onChange={e => updateConfig('database', e.target.value)} /></div>
            <div className="form-group">
              <label>Authentication</label>
              <select value={(config.auth as string) || 'SQL Login'} onChange={e => updateConfig('auth', e.target.value)}>
                {sqlAuthMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Username</label><input type="text" value={(config.username as string) || ''} onChange={e => updateConfig('username', e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={(config.password as string) || ''} onChange={e => updateConfig('password', e.target.value)} /></div>
            <div className="form-group checkbox"><label><input type="checkbox" checked={(config.trustCert as boolean) || false} onChange={e => updateConfig('trustCert', e.target.checked)} /> Trust Server Certificate</label></div>
          </>
        );
      case 'snowflake':
        return (
          <>
            <div className="form-group"><label>Account Identifier</label><input type="text" placeholder="xy12345.us-east-1" value={(config.account as string) || ''} onChange={e => updateConfig('account', e.target.value)} /></div>
            <div className="form-group"><label>Username</label><input type="text" value={(config.username as string) || ''} onChange={e => updateConfig('username', e.target.value)} /></div>
            <div className="form-group">
              <label>Authentication Method</label>
              <div className="radio-group">
                <label className="radio-label"><input type="radio" checked={authMethod === 'password'} onChange={() => { setAuthMethod('password'); updateConfig('authMethod', 'password'); }} /> Password</label>
                <label className="radio-label"><input type="radio" checked={authMethod === 'keyPair'} onChange={() => { setAuthMethod('keyPair'); updateConfig('authMethod', 'keyPair'); }} /> Key Pair</label>
              </div>
            </div>
            {authMethod === 'password' ? (
              <div className="form-group"><label>Password</label><input type="password" value={(config.password as string) || ''} onChange={e => updateConfig('password', e.target.value)} /></div>
            ) : (
              <div className="form-group"><label>Private Key</label><textarea rows={4} value={(config.privateKey as string) || ''} onChange={e => updateConfig('privateKey', e.target.value)} /></div>
            )}
            <div className="form-group"><label>Warehouse</label><input type="text" value={(config.warehouse as string) || ''} onChange={e => updateConfig('warehouse', e.target.value)} /></div>
            <div className="form-group"><label>Database</label><input type="text" value={(config.database as string) || ''} onChange={e => updateConfig('database', e.target.value)} /></div>
            <div className="form-group"><label>Schema</label><input type="text" value={(config.schema as string) || ''} onChange={e => updateConfig('schema', e.target.value)} /></div>
            <div className="form-group"><label>Role (optional)</label><input type="text" value={(config.role as string) || ''} onChange={e => updateConfig('role', e.target.value)} /></div>
          </>
        );
      case 'bigquery':
        return (
          <>
            <div className="form-group"><label>Project ID</label><input type="text" value={(config.projectId as string) || ''} onChange={e => updateConfig('projectId', e.target.value)} /></div>
            <div className="form-group"><label>Dataset</label><input type="text" value={(config.dataset as string) || ''} onChange={e => updateConfig('dataset', e.target.value)} /></div>
            <div className="form-group"><label>Service Account JSON</label><textarea rows={4} value={(config.serviceAccount as string) || ''} onChange={e => updateConfig('serviceAccount', e.target.value)} /></div>
            <div className="form-group">
              <label>Location (optional)</label>
              <select value={(config.location as string) || ''} onChange={e => updateConfig('location', e.target.value)}>
                <option value="">Auto-detect</option>
                {bigQueryLocations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </>
        );
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configure {connection.name}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {type === 'file' ? renderFileFields() : renderDbFields()}
          {testStatus !== 'idle' && (
            <div className={`test-result ${testStatus}`}>
              {testStatus === 'testing' && <Loader2 size={16} className="spinner" />}
              {testStatus === 'success' && <Check size={16} />}
              {testStatus === 'error' && <AlertCircle size={16} />}
              <span>{testStatus === 'testing' ? 'Testing connection...' : testMessage}</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleTest} disabled={testStatus === 'testing'}>
            Test Connection
          </button>
          <div className="btn-group">
            <button className="btn-text" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
