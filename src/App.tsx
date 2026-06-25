import React, { useState } from 'react';
import { FolderOpen, Database, Globe, Plus, Settings, Check } from 'lucide-react';
import { FileConnection, DbConnection, ApiCollection, Environment, NavSection } from './types';
import { ConnectionModal } from './components/ConnectionModal';
import { ApiClient } from './components/ApiClient';

const fileConnectors = [
  { type: 's3' as const, name: 'Amazon S3', color: '#FF9900', icon: 'S3' },
  { type: 'gcs' as const, name: 'Google Cloud Storage', color: '#4285F4', icon: 'GCS' },
  { type: 'azure' as const, name: 'Azure Blob Storage', color: '#0078D4', icon: 'AZ' },
  { type: 'sftp' as const, name: 'SFTP', color: '#4A5568', icon: 'SFTP' },
  { type: 'local' as const, name: 'Local / NFS', color: '#718096', icon: 'LOC' }
];

const dbConnectors = [
  { type: 'postgres' as const, name: 'PostgreSQL', color: '#336791', icon: 'PG' },
  { type: 'mysql' as const, name: 'MySQL', color: '#00618A', icon: 'SQL' },
  { type: 'mssql' as const, name: 'SQL Server', color: '#CC2927', icon: 'MS' },
  { type: 'snowflake' as const, name: 'Snowflake', color: '#29B5E8', icon: 'SF' },
  { type: 'bigquery' as const, name: 'BigQuery', color: '#4285F4', icon: 'BQ' }
];

function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('files');
  
  const [fileConnections, setFileConnections] = useState<FileConnection[]>([
    { id: '1', type: 's3', name: 'Amazon S3', status: 'connected', config: { region: 'us-east-1', bucket: 'my-data-bucket' } },
    { id: '2', type: 'gcs', name: 'Google Cloud Storage', status: 'disconnected', config: {} },
    { id: '3', type: 'azure', name: 'Azure Blob Storage', status: 'disconnected', config: {} },
    { id: '4', type: 'sftp', name: 'SFTP', status: 'disconnected', config: {} },
    { id: '5', type: 'local', name: 'Local / NFS', status: 'disconnected', config: {} }
  ]);

  const [dbConnections, setDbConnections] = useState<DbConnection[]>([
    { id: '1', type: 'postgres', name: 'PostgreSQL', status: 'connected', config: { host: 'localhost', database: 'analytics' } },
    { id: '2', type: 'mysql', name: 'MySQL', status: 'disconnected', config: {} },
    { id: '3', type: 'mssql', name: 'SQL Server', status: 'disconnected', config: {} },
    { id: '4', type: 'snowflake', name: 'Snowflake', status: 'disconnected', config: {} },
    { id: '5', type: 'bigquery', name: 'BigQuery', status: 'disconnected', config: {} }
  ]);

  const [editingConnection, setEditingConnection] = useState<FileConnection | DbConnection | null>(null);
  const [editingType, setEditingType] = useState<'file' | 'database'>('file');

  const handleEditFile = (conn: FileConnection) => {
    setEditingConnection(conn);
    setEditingType('file');
  };

  const handleEditDb = (conn: DbConnection) => {
    setEditingConnection(conn);
    setEditingType('database');
  };

  const handleSaveConnection = (conn: FileConnection | DbConnection) => {
    if ('type' in conn && fileConnectors.some(c => c.type === conn.type)) {
      setFileConnections(prev => prev.map(c => c.id === conn.id ? conn as FileConnection : c));
    } else {
      setDbConnections(prev => prev.map(c => c.id === conn.id ? conn as DbConnection : c));
    }
    setEditingConnection(null);
  };

  const renderConnectorCard = (
    conn: FileConnection | DbConnection,
    connector: { name: string; color: string; icon: string },
    onEdit: () => void
  ) => (
    <div key={conn.id} className="connector-card">
      <div className="connector-header">
        <div className="connector-icon" style={{ backgroundColor: connector.color + '20', color: connector.color }}>
          {connector.icon}
        </div>
        <div className={`status-badge ${conn.status}`}>
          {conn.status === 'connected' ? (
            <><Check size={12} /> Connected</>
          ) : (
            'Not Connected'
          )}
        </div>
      </div>
      <h3 className="connector-name">{connector.name}</h3>
      <button className={`btn-configure ${conn.status}`} onClick={onEdit}>
        <Settings size={14} />
        {conn.status === 'connected' ? 'Configure' : 'Connect'}
      </button>
    </div>
  );

  const renderFilesSection = () => (
    <div className="section-content">
      <div className="section-header">
        <h1>File Connections</h1>
        <p className="section-description">Connect to cloud storage, SFTP, and local file systems</p>
      </div>
      <div className="connectors-grid">
        {fileConnections.map(conn => {
          const connector = fileConnectors.find(c => c.type === conn.type)!;
          return renderConnectorCard(conn, connector, () => handleEditFile(conn));
        })}
      </div>
    </div>
  );

  const renderDatabaseSection = () => (
    <div className="section-content">
      <div className="section-header">
        <h1>Database Connections</h1>
        <p className="section-description">Connect to relational databases and data warehouses</p>
      </div>
      <div className="connectors-grid">
        {dbConnections.map(conn => {
          const connector = dbConnectors.find(c => c.type === conn.type)!;
          return renderConnectorCard(conn, connector, () => handleEditDb(conn));
        })}
      </div>
    </div>
  );

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">EZ Connect</span>
        </div>
        
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeSection === 'files' ? 'active' : ''}`}
            onClick={() => setActiveSection('files')}
          >
            <FolderOpen size={20} />
            <span>File Connections</span>
          </button>
          <button
            className={`nav-item ${activeSection === 'database' ? 'active' : ''}`}
            onClick={() => setActiveSection('database')}
          >
            <Database size={20} />
            <span>Database Connections</span>
          </button>
          <button
            className={`nav-item ${activeSection === 'api' ? 'active' : ''}`}
            onClick={() => setActiveSection('api')}
          >
            <Globe size={20} />
            <span>API Connections</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeSection === 'files' && renderFilesSection()}
        {activeSection === 'database' && renderDatabaseSection()}
        {activeSection === 'api' && <ApiClient />}
      </main>

      {/* Connection Modal */}
      {editingConnection && (
        <ConnectionModal
          connection={editingConnection}
          type={editingType}
          onClose={() => setEditingConnection(null)}
          onSave={handleSaveConnection}
        />
      )}

      {/* Styles */}
      <style>{`
        .app {
          display: flex;
          min-height: 100vh;
          background: #F9FAFB;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .sidebar {
          width: 260px;
          background: white;
          border-right: 1px solid #E5E7EB;
          display: flex;
          flex-direction: column;
        }

        .sidebar-logo {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid #E5E7EB;
        }

        .logo-icon {
          font-size: 24px;
        }

        .logo-text {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
        }

        .sidebar-nav {
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border: none;
          background: transparent;
          border-radius: 6px;
          color: #4B5563;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .nav-item:hover {
          background: #F3F4F6;
          color: #111827;
        }

        .nav-item.active {
          background: #2563EB;
          color: white;
        }

        .main-content {
          flex: 1;
          padding: 32px;
          overflow: auto;
        }

        .section-header {
          margin-bottom: 24px;
        }

        .section-header h1 {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 4px;
        }

        .section-description {
          color: #6B7280;
          font-size: 14px;
        }

        .connectors-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .connector-card {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .connector-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .connector-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 600;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.connected {
          background: #DEF7EC;
          color: #03543F;
        }

        .status-badge.disconnected {
          background: #F3F4F6;
          color: #6B7280;
        }

        .connector-name {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
          margin-bottom: 12px;
        }

        .btn-configure {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          color: #374151;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-configure:hover {
          background: #F9FAFB;
          border-color: #D1D5DB;
        }

        .btn-configure.connected {
          border-color: #10B981;
          color: #059669;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .modal {
          background: white;
          border-radius: 8px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow: auto;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #E5E7EB;
        }

        .modal-header h2 {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .close-btn {
          background: none;
          border: none;
          color: #6B7280;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }

        .close-btn:hover {
          background: #F3F4F6;
        }

        .modal-body {
          padding: 20px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group.checkbox {
          display: flex;
          align-items: center;
        }

        .form-group.checkbox label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .form-group label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }

        .form-group input[type="text"],
        .form-group input[type="password"],
        .form-group input[type="number"],
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .form-group textarea {
          resize: vertical;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
        }

        .radio-group {
          display: flex;
          gap: 16px;
        }

        .radio-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: #374151;
          cursor: pointer;
        }

        .test-result {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 6px;
          font-size: 14px;
          margin-top: 16px;
        }

        .test-result.success {
          background: #DEF7EC;
          color: #03543F;
        }

        .test-result.error {
          background: #FDE8E8;
          color: #9B1C1C;
        }

        .test-result.testing {
          background: #FEF3C7;
          color: #92400E;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .modal-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-top: 1px solid #E5E7EB;
        }

        .btn-group {
          display: flex;
          gap: 12px;
        }

        .btn-primary {
          padding: 8px 16px;
          background: #2563EB;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-primary:hover {
          background: #1D4ED8;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          padding: 8px 16px;
          background: white;
          color: #374151;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-secondary:hover {
          background: #F9FAFB;
        }

        .btn-text {
          padding: 8px 16px;
          background: transparent;
          color: #6B7280;
          border: none;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-text:hover {
          color: #374151;
        }

        /* API Client Styles */
        .api-client {
          display: flex;
          height: calc(100vh - 64px);
          margin: -32px;
        }

        .api-sidebar {
          width: 260px;
          background: white;
          border-right: 1px solid #E5E7EB;
          display: flex;
          flex-direction: column;
        }

        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #E5E7EB;
        }

        .sidebar-header span {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
        }

        .btn-icon {
          background: none;
          border: none;
          color: #6B7280;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }

        .btn-icon:hover {
          background: #F3F4F6;
          color: #374151;
        }

        .collections-list {
          flex: 1;
          overflow: auto;
          padding: 8px;
        }

        .collection {
          margin-bottom: 4px;
        }

        .collection-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
        }

        .collection-header:hover {
          background: #F3F4F6;
        }

        .collection-name {
          flex: 1;
        }

        .requests-list {
          margin-left: 24px;
        }

        .request-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        }

        .request-item:hover {
          background: #F3F4F6;
        }

        .request-item.active {
          background: #EFF6FF;
        }

        .method-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
          color: white;
        }

        .request-name {
          flex: 1;
          color: #374151;
        }

        .api-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: white;
          overflow: auto;
        }

        .request-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #E5E7EB;
        }

        .request-name-input {
          font-size: 16px;
          font-weight: 600;
          border: none;
          background: transparent;
          color: #111827;
          padding: 0;
          flex: 1;
        }

        .request-name-input:focus {
          outline: none;
        }

        .request-line {
          display: flex;
          gap: 8px;
          padding: 12px 20px;
          border-bottom: 1px solid #E5E7EB;
        }

        .method-dropdown {
          position: relative;
        }

        .method-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .method-options {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          z-index: 10;
        }

        .method-option {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }

        .method-option:hover {
          background: #F3F4F6;
        }

        .url-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
        }

        .url-input:focus {
          outline: none;
          border-color: #2563EB;
        }

        .send-btn {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .request-tabs {
          display: flex;
          gap: 4px;
          padding: 0 20px;
          border-bottom: 1px solid #E5E7EB;
        }

        .tab {
          padding: 12px 16px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          font-size: 13px;
          font-weight: 500;
          color: #6B7280;
          cursor: pointer;
          margin-bottom: -1px;
        }

        .tab:hover {
          color: #374151;
        }

        .tab.active {
          color: #2563EB;
          border-bottom-color: #2563EB;
        }

        .tab-content {
          flex: 1;
          padding: 20px;
          overflow: auto;
        }

        .key-value-table {
          width: 100%;
        }

        .table-header {
          display: grid;
          grid-template-columns: 30px 1fr 1fr 30px;
          gap: 8px;
          padding: 8px 0;
          border-bottom: 1px solid #E5E7EB;
          font-size: 12px;
          font-weight: 500;
          color: #6B7280;
        }

        .table-row {
          display: grid;
          grid-template-columns: 30px 1fr 1fr 30px;
          gap: 8px;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #F3F4F6;
        }

        .table-row input[type="text"] {
          padding: 6px 8px;
          border: 1px solid #E5E7EB;
          border-radius: 4px;
          font-size: 13px;
        }

        .table-row input[type="text"]:focus {
          outline: none;
          border-color: #2563EB;
        }

        .btn-add-row {
          margin-top: 8px;
          padding: 8px 12px;
          background: none;
          border: none;
          color: #2563EB;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-add-row:hover {
          color: #1D4ED8;
        }

        .url-preview {
          margin-top: 16px;
          padding: 12px;
          background: #F3F4F6;
          border-radius: 6px;
          font-size: 13px;
          font-family: monospace;
          word-break: break-all;
        }

        .auth-section .form-group {
          margin-bottom: 16px;
        }

        .auth-section select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 14px;
        }

        .body-section .body-modes {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
        }

        .body-section .radio-label {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 0;
          cursor: pointer;
          font-size: 13px;
        }

        .body-section .radio-label.active {
          color: #2563EB;
          font-weight: 500;
        }

        .body-section select {
          margin-bottom: 12px;
          padding: 6px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
        }

        .code-editor {
          width: 100%;
          padding: 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 13px;
          line-height: 1.5;
          resize: vertical;
        }

        .code-editor:focus {
          outline: none;
          border-color: #2563EB;
        }

        .scripts-section .script-tabs {
          display: flex;
          gap: 16px;
          margin-bottom: 12px;
          border-bottom: 1px solid #E5E7EB;
        }

        .script-tab {
          padding: 8px 0;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          font-size: 13px;
          color: #6B7280;
          cursor: pointer;
          margin-bottom: -1px;
        }

        .script-tab.active {
          color: #2563EB;
          border-bottom-color: #2563EB;
        }

        .settings-section .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #F3F4F6;
        }

        .setting-row span:first-child {
          font-size: 14px;
          color: #374151;
        }

        .badge-new {
          background: #2563EB;
          color: white;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .toggle {
          width: 44px;
          height: 24px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          position: relative;
          transition: background 0.2s;
        }

        .toggle.on {
          background: #2563EB;
        }

        .toggle.off {
          background: #D1D5DB;
        }

        .toggle-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }

        .toggle.on .toggle-thumb {
          transform: translateX(20px);
        }

        .response-viewer {
          border-top: 1px solid #E5E7EB;
          margin: 0 -20px -20px;
          padding: 20px;
          background: #FAFAFA;
        }

        .response-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .response-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .response-meta .status-badge {
          font-weight: 600;
        }

        .meta-item {
          font-size: 13px;
          color: #6B7280;
        }

        .response-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid #E5E7EB;
          margin-bottom: 12px;
        }

        .response-content {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          padding: 12px;
        }

        .code-block {
          margin: 0;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .key-value-display {
          font-size: 13px;
        }

        .kv-row {
          margin-bottom: 8px;
        }

        .kv-row .key {
          font-weight: 500;
          color: #374151;
        }

        .env-selector {
          padding: 12px 16px;
          border-bottom: 1px solid #E5E7EB;
        }

        .env-selector select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 14px;
        }

        .env-variables {
          flex: 1;
          overflow: auto;
          padding: 12px 16px;
        }

        .env-variables .table-header {
          grid-template-columns: 1fr 1fr 1fr;
        }

        .env-variables .table-row {
          grid-template-columns: 1fr 1fr 1fr;
        }

        .env-variables input {
          font-size: 12px;
        }

        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #6B7280;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

export default App;
