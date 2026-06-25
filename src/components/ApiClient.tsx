import { useState } from 'react';
import { Send, Plus, ChevronDown, ChevronRight, MoreHorizontal, Copy, Check } from 'lucide-react';
import { ApiCollection, ApiRequest, Environment, HttpMethod, ApiResponse } from '../types';

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const methodColors: Record<HttpMethod, string> = {
  GET: '#16A34A',
  POST: '#2563EB',
  PUT: '#D97706',
  PATCH: '#7C3AED',
  DELETE: '#DC2626',
  HEAD: '#6B7280',
  OPTIONS: '#6B7280'
};

const authTypes = ['No Auth', 'Basic Auth', 'Bearer Token', 'JWT Bearer', 'OAuth 1.0', 'OAuth 2.0', 'API Key', 'AWS Signature'];

const bodyModes = ['none', 'form-data', 'x-www-form-urlencoded', 'raw', 'binary'];

const httpVersions: Array<'Auto' | 'HTTP/1' | 'HTTP/1.1' | 'HTTP/2'> = ['Auto', 'HTTP/1', 'HTTP/1.1', 'HTTP/2'];

export function ApiClient() {
  // Collections state
  const [collections, setCollections] = useState<ApiCollection[]>([
    {
      id: '1',
      name: 'Sample API',
      expanded: true,
      requests: [
        { id: '1', name: 'Get Users', method: 'GET', url: 'https://api.example.com/v1/users', params: [], headers: [], body: { mode: 'none', content: '' }, auth: { type: 'No Auth', config: {} }, scripts: { preRequest: '', postResponse: '' }, settings: { httpVersion: 'Auto', sslVerification: false, followRedirects: true, followOriginalMethod: false, followAuthHeader: false, removeRefererOnRedirect: false, strictHttpParser: false, encodeUrlAutomatically: true, disableCookieJar: false, useServerCipherSuite: false, maxRedirects: 10 } },
        { id: '2', name: 'Create User', method: 'POST', url: 'https://api.example.com/v1/users', params: [], headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }], body: { mode: 'raw', contentType: 'json', content: '{"name": "John Doe", "email": "john@example.com"}' }, auth: { type: 'Bearer Token', config: { token: '' } }, scripts: { preRequest: '', postResponse: '' }, settings: { httpVersion: 'Auto', sslVerification: false, followRedirects: true, followOriginalMethod: false, followAuthHeader: false, removeRefererOnRedirect: false, strictHttpParser: false, encodeUrlAutomatically: true, disableCookieJar: false, useServerCipherSuite: false, maxRedirects: 10 } },
        { id: '3', name: 'Delete User', method: 'DELETE', url: 'https://api.example.com/v1/users/:id', params: [{ key: 'id', value: '123', enabled: true }], headers: [], body: { mode: 'none', content: '' }, auth: { type: 'No Auth', config: {} }, scripts: { preRequest: '', postResponse: '' }, settings: { httpVersion: 'Auto', sslVerification: false, followRedirects: true, followOriginalMethod: false, followAuthHeader: false, removeRefererOnRedirect: false, strictHttpParser: false, encodeUrlAutomatically: true, disableCookieJar: false, useServerCipherSuite: false, maxRedirects: 10 } }
      ]
    }
  ]);

  // Environments state
  const [environments] = useState<Environment[]>([
    { id: '1', name: 'Development', variables: [{ id: '1', name: 'base_url', initialValue: 'https://dev.api.example.com', currentValue: 'https://dev.api.example.com', isSecret: false }] },
    { id: '2', name: 'Production', variables: [{ id: '1', name: 'base_url', initialValue: 'https://api.example.com', currentValue: 'https://api.example.com', isSecret: false }] }
  ]);
  const [activeEnv, setActiveEnv] = useState<string>('1');

  // Request state
  const [selectedRequest, setSelectedRequest] = useState<ApiRequest | null>(collections[0].requests[0]);
  const [activeTab, setActiveTab] = useState('params');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [responseTab, setResponseTab] = useState('body');
  const [methodDropdownOpen, setMethodDropdownOpen] = useState(false);
  const [bodyMode, setBodyMode] = useState('raw');
  const [copied, setCopied] = useState(false);

  const currentEnv = environments.find(e => e.id === activeEnv);

  const interpolateVars = (text: string) => {
    if (!currentEnv) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      const v = currentEnv.variables.find(v => v.name === name);
      return v ? (v.isSecret ? '***' : v.currentValue) : `{{${name}}}`;
    });
  };

  const handleSend = async () => {
    if (!selectedRequest) return;
    setSending(true);
    
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const mockResponses = [
      { status: 200, statusText: 'OK', body: JSON.stringify({ users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] }, null, 2) },
      { status: 201, statusText: 'Created', body: JSON.stringify({ id: 3, name: 'New User', created: true }, null, 2) },
      { status: 400, statusText: 'Bad Request', body: JSON.stringify({ error: 'Invalid request' }, null, 2) },
      { status: 404, statusText: 'Not Found', body: JSON.stringify({ error: 'Resource not found' }, null, 2) },
      { status: 500, statusText: 'Internal Server Error', body: JSON.stringify({ error: 'Server error' }, null, 2) }
    ];
    
    const mockResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
    
    setResponse({
      status: mockResponse.status,
      statusText: mockResponse.statusText,
      time: Math.floor(Math.random() * 500) + 50,
      size: mockResponse.body.length,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req_' + Math.random().toString(36).slice(2) },
      body: mockResponse.body,
      cookies: {}
    });
    setSending(false);
  };

  const updateRequest = (updates: Partial<ApiRequest>) => {
    if (!selectedRequest) return;
    const updated = { ...selectedRequest, ...updates };
    setSelectedRequest(updated);
    setCollections(collections.map(col => ({
      ...col,
      requests: col.requests.map(r => r.id === updated.id ? updated : r)
    })));
  };

  const addParam = () => {
    if (!selectedRequest) return;
    updateRequest({ params: [...selectedRequest.params, { key: '', value: '', enabled: true }] });
  };

  const updateParam = (idx: number, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    if (!selectedRequest) return;
    const params = [...selectedRequest.params];
    params[idx] = { ...params[idx], [field]: value };
    updateRequest({ params });
  };

  const removeParam = (idx: number) => {
    if (!selectedRequest) return;
    updateRequest({ params: selectedRequest.params.filter((_, i) => i !== idx) });
  };

  const addHeader = () => {
    if (!selectedRequest) return;
    updateRequest({ headers: [...selectedRequest.headers, { key: '', value: '', enabled: true }] });
  };

  const updateHeader = (idx: number, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    if (!selectedRequest) return;
    const headers = [...selectedRequest.headers];
    headers[idx] = { ...headers[idx], [field]: value };
    updateRequest({ headers });
  };

  const removeHeader = (idx: number) => {
    if (!selectedRequest) return;
    updateRequest({ headers: selectedRequest.headers.filter((_, i) => i !== idx) });
  };

  const copyResponse = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleCollection = (id: string) => {
    setCollections(collections.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c));
  };

  const buildUrl = () => {
    if (!selectedRequest) return '';
    const params = selectedRequest.params.filter(p => p.enabled && p.key);
    if (params.length === 0) return selectedRequest.url;
    const queryString = params.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${selectedRequest.url}?${queryString}`;
  };

  const getStatusColor = (status: number) => {
    if (status < 300) return '#16A34A';
    if (status < 400) return '#D97706';
    return '#DC2626';
  };

  return (
    <div className="api-client">
      {/* Left Panel - Collections */}
      <div className="api-sidebar">
        <div className="sidebar-header">
          <span>Collections</span>
          <button className="btn-icon"><Plus size={16} /></button>
        </div>
        <div className="collections-list">
          {collections.map(collection => (
            <div key={collection.id} className="collection">
              <div className="collection-header" onClick={() => toggleCollection(collection.id)}>
                {collection.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="collection-name">{collection.name}</span>
                <button className="btn-icon"><MoreHorizontal size={14} /></button>
              </div>
              {collection.expanded && (
                <div className="requests-list">
                  {collection.requests.map(request => (
                    <div
                      key={request.id}
                      className={`request-item ${selectedRequest?.id === request.id ? 'active' : ''}`}
                      onClick={() => setSelectedRequest(request)}
                    >
                      <span className="method-badge" style={{ background: methodColors[request.method] }}>{request.method}</span>
                      <span className="request-name">{request.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Center Panel - Request Builder */}
      <div className="api-main">
        {selectedRequest ? (
          <>
            <div className="request-top-bar">
              <input
                className="request-name-input"
                value={selectedRequest.name}
                onChange={e => updateRequest({ name: e.target.value })}
              />
              <button className="btn-secondary">Save</button>
            </div>

            <div className="request-line">
              <div className="method-dropdown">
                <button
                  className="method-btn"
                  style={{ background: methodColors[selectedRequest.method], color: 'white' }}
                  onClick={() => setMethodDropdownOpen(!methodDropdownOpen)}
                >
                  {selectedRequest.method} <ChevronDown size={14} />
                </button>
                {methodDropdownOpen && (
                  <div className="method-options">
                    {methods.map(m => (
                      <div
                        key={m}
                        className="method-option"
                        style={{ color: methodColors[m] }}
                        onClick={() => { updateRequest({ method: m }); setMethodDropdownOpen(false); }}
                      >
                        {m}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input
                className="url-input"
                value={selectedRequest.url}
                onChange={e => updateRequest({ url: e.target.value })}
                placeholder="https://api.example.com/endpoint"
              />
              <button className="btn-primary send-btn" onClick={handleSend} disabled={sending}>
                {sending ? 'Sending...' : (<><Send size={16} /> Send</>)}
              </button>
            </div>

            <div className="request-tabs">
              {['params', 'authorization', 'headers', 'body', 'scripts', 'settings'].map(tab => (
                <button
                  key={tab}
                  className={`tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="tab-content">
              {activeTab === 'params' && (
                <div className="key-value-table">
                  <div className="table-header">
                    <span></span>
                    <span>Key</span>
                    <span>Value</span>
                    <span></span>
                  </div>
                  {selectedRequest.params.map((param, idx) => (
                    <div key={idx} className="table-row">
                      <input type="checkbox" checked={param.enabled} onChange={e => updateParam(idx, 'enabled', e.target.checked)} />
                      <input type="text" placeholder="key" value={param.key} onChange={e => updateParam(idx, 'key', e.target.value)} />
                      <input type="text" placeholder="value" value={param.value} onChange={e => updateParam(idx, 'value', e.target.value)} />
                      <button className="btn-icon" onClick={() => removeParam(idx)}>×</button>
                    </div>
                  ))}
                  <button className="btn-add-row" onClick={addParam}>+ Add Parameter</button>
                  <div className="url-preview"><strong>URL Preview: </strong>{interpolateVars(buildUrl())}</div>
                </div>
              )}

              {activeTab === 'authorization' && (
                <div className="auth-section">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={selectedRequest.auth.type}
                      onChange={e => updateRequest({ auth: { ...selectedRequest.auth, type: e.target.value } })}
                    >
                      {authTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {selectedRequest.auth.type === 'Bearer Token' && (
                    <div className="form-group">
                      <label>Token</label>
                      <input
                        type="text"
                        value={selectedRequest.auth.config.token || ''}
                        onChange={e => updateRequest({ auth: { ...selectedRequest.auth, config: { ...selectedRequest.auth.config, token: e.target.value } } })}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'headers' && (
                <div className="key-value-table">
                  <div className="table-header">
                    <span></span>
                    <span>Key</span>
                    <span>Value</span>
                    <span></span>
                  </div>
                  {selectedRequest.headers.map((header, idx) => (
                    <div key={idx} className="table-row">
                      <input type="checkbox" checked={header.enabled} onChange={e => updateHeader(idx, 'enabled', e.target.checked)} />
                      <input type="text" placeholder="key" value={header.key} onChange={e => updateHeader(idx, 'key', e.target.value)} />
                      <input type="text" placeholder="value" value={header.value} onChange={e => updateHeader(idx, 'value', e.target.value)} />
                      <button className="btn-icon" onClick={() => removeHeader(idx)}>×</button>
                    </div>
                  ))}
                  <button className="btn-add-row" onClick={addHeader}>+ Add Header</button>
                </div>
              )}

              {activeTab === 'body' && (
                <div className="body-section">
                  <div className="body-modes">
                    {bodyModes.map(mode => (
                      <label key={mode} className={`radio-label ${bodyMode === mode ? 'active' : ''}`}>
                        <input
                          type="radio"
                          checked={bodyMode === mode}
                          onChange={() => setBodyMode(mode)}
                        />
                        {mode.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </label>
                    ))}
                  </div>
                  {bodyMode === 'raw' && (
                    <>
                      <select
                        value={selectedRequest.body.contentType || 'json'}
                        onChange={e => updateRequest({ body: { ...selectedRequest.body, contentType: e.target.value } })}
                      >
                        <option value="json">JSON</option>
                        <option value="xml">XML</option>
                        <option value="text">Text</option>
                        <option value="html">HTML</option>
                        <option value="javascript">JavaScript</option>
                      </select>
                      <textarea
                        className="code-editor"
                        rows={12}
                        value={selectedRequest.body.content}
                        onChange={e => updateRequest({ body: { ...selectedRequest.body, content: e.target.value } })}
                      />
                    </>
                  )}
                </div>
              )}

              {activeTab === 'scripts' && (
                <div className="scripts-section">
                  <div className="script-tabs">
                    <button className="script-tab active">Pre-request Script</button>
                    <button className="script-tab">Post-response Script</button>
                  </div>
                  <textarea
                    className="code-editor"
                    rows={10}
                    placeholder="// Write your script here..."
                    value={selectedRequest.scripts.preRequest}
                    onChange={e => updateRequest({ scripts: { ...selectedRequest.scripts, preRequest: e.target.value } })}
                  />
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="settings-section">
                  <div className="setting-row">
                    <span>HTTP version</span>
                    <select value={selectedRequest.settings.httpVersion} onChange={e => updateRequest({ settings: { ...selectedRequest.settings, httpVersion: e.target.value as 'Auto' | 'HTTP/1' | 'HTTP/1.1' | 'HTTP/2' } })}>
                      {httpVersions.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <span className="badge-new">NEW</span>
                  </div>
                  <div className="setting-row"><span>Enable SSL certificate verification</span><Toggle checked={selectedRequest.settings.sslVerification} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, sslVerification: v } })} /></div>
                  <div className="setting-row"><span>Automatically follow redirects</span><Toggle checked={selectedRequest.settings.followRedirects} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, followRedirects: v } })} /></div>
                  <div className="setting-row"><span>Follow original HTTP method</span><Toggle checked={selectedRequest.settings.followOriginalMethod} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, followOriginalMethod: v } })} /></div>
                  <div className="setting-row"><span>Follow Authorization header</span><Toggle checked={selectedRequest.settings.followAuthHeader} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, followAuthHeader: v } })} /></div>
                  <div className="setting-row"><span>Remove referer header on redirect</span><Toggle checked={selectedRequest.settings.removeRefererOnRedirect} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, removeRefererOnRedirect: v } })} /></div>
                  <div className="setting-row"><span>Enable strict HTTP parser</span><Toggle checked={selectedRequest.settings.strictHttpParser} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, strictHttpParser: v } })} /></div>
                  <div className="setting-row"><span>Encode URL automatically</span><Toggle checked={selectedRequest.settings.encodeUrlAutomatically} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, encodeUrlAutomatically: v } })} /></div>
                  <div className="setting-row"><span>Disable cookie jar</span><Toggle checked={selectedRequest.settings.disableCookieJar} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, disableCookieJar: v } })} /></div>
                  <div className="setting-row"><span>Use server cipher suite during handshake</span><Toggle checked={selectedRequest.settings.useServerCipherSuite} onChange={v => updateRequest({ settings: { ...selectedRequest.settings, useServerCipherSuite: v } })} /></div>
                  <div className="setting-row"><span>Maximum number of redirects</span><input type="number" value={selectedRequest.settings.maxRedirects} onChange={e => updateRequest({ settings: { ...selectedRequest.settings, maxRedirects: parseInt(e.target.value) } })} /></div>
                </div>
              )}
            </div>

            {/* Response Viewer */}
            {response && (
              <div className="response-viewer">
                <div className="response-header">
                  <div className="response-meta">
                    <span className="status-badge" style={{ background: getStatusColor(response.status) }}>{response.status} {response.statusText}</span>
                    <span className="meta-item">{response.time} ms</span>
                    <span className="meta-item">{response.size} B</span>
                  </div>
                  <button className="btn-icon" onClick={copyResponse}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
                <div className="response-tabs">
                  {['body', 'headers', 'cookies'].map(tab => (
                    <button
                      key={tab}
                      className={`tab ${responseTab === tab ? 'active' : ''}`}
                      onClick={() => setResponseTab(tab)}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="response-content">
                  {responseTab === 'body' && <pre className="code-block">{response.body}</pre>}
                  {responseTab === 'headers' && (
                    <div className="key-value-display">
                      {Object.entries(response.headers).map(([k, v]) => (
                        <div key={k} className="kv-row"><span className="key">{k}:</span> <span>{v}</span></div>
                      ))}
                    </div>
                  )}
                  {responseTab === 'cookies' && <div className="key-value-display">No cookies</div>}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">Select a request to start</div>
        )}
      </div>

      {/* Right Panel - Environments */}
      <div className="api-sidebar">
        <div className="sidebar-header">
          <span>Environments</span>
          <button className="btn-icon"><Plus size={16} /></button>
        </div>
        <div className="env-selector">
          <select value={activeEnv} onChange={e => setActiveEnv(e.target.value)}>
            {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        
        {currentEnv && (
          <div className="env-variables">
            <div className="table-header">
              <span>Variable</span>
              <span>Initial</span>
              <span>Current</span>
            </div>
            {currentEnv.variables.map(v => (
              <div key={v.id} className="table-row">
                <input type="text" value={v.name} readOnly />
                <input type={v.isSecret ? 'password' : 'text'} value={v.initialValue} readOnly />
                <input type={v.isSecret ? 'password' : 'text'} value={v.currentValue} readOnly />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle ${checked ? 'on' : 'off'}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}
