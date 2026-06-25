// File Connection Types
export type FileConnectorType = 's3' | 'gcs' | 'azure' | 'sftp' | 'local';

export interface FileConnection {
  id: string;
  type: FileConnectorType;
  name: string;
  status: 'connected' | 'disconnected';
  config: Record<string, string | boolean | number>;
}

// Database Connection Types
export type DbConnectorType = 'postgres' | 'mysql' | 'mssql' | 'snowflake' | 'bigquery';

export interface DbConnection {
  id: string;
  type: DbConnectorType;
  name: string;
  status: 'connected' | 'disconnected';
  config: Record<string, string | boolean | number>;
}

// API Types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: { key: string; value: string; enabled: boolean }[];
  headers: { key: string; value: string; enabled: boolean }[];
  body: {
    mode: 'none' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary';
    contentType?: string;
    content: string;
  };
  auth: {
    type: string;
    config: Record<string, string>;
  };
  scripts: {
    preRequest: string;
    postResponse: string;
  };
  settings: HttpSettings;
}

export interface HttpSettings {
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
}

export interface ApiCollection {
  id: string;
  name: string;
  expanded: boolean;
  requests: ApiRequest[];
}

export interface EnvironmentVariable {
  id: string;
  name: string;
  initialValue: string;
  currentValue: string;
  isSecret: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

export interface ApiResponse {
  status: number;
  statusText: string;
  time: number;
  size: number;
  headers: Record<string, string>;
  body: string;
  cookies: Record<string, string>;
}

export type NavSection = 'files' | 'database' | 'api';
