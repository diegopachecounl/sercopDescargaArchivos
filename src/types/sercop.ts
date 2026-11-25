export type SercopTabId = 'info' | 'participantes' | 'productos' | 'archivos' | 'cronograma';

export type FileDownloadStatus = 'idle' | 'downloading' | 'saved' | 'error';

export interface SercopFileItem {
  id: string;
  index: number;
  tableName: string;
  phase: string;
  date: string;
  size: string;
  extension: string;
  suggestedFilename: string;
  downloadUrl: string;
  sourceLabel?: string;
  uploadedByEntity?: string;
  uploadedByUser?: string;
}

export interface SercopInfoField {
  label: string;
  value: string;
  accent?: boolean;
  isLink?: boolean;
  href?: string;
}

export interface SercopParticipant {
  name: string;
  ruc: string;
  status: string;
  publishedValue: string;
  finalOffer: string;
  variation: string;
  proposalsCount: string;
}

export interface SercopProduct {
  cpc: string;
  cpcDescription: string;
  productDescription: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotal: string;
}

export interface SercopScheduleItem {
  stage: string;
  date: string;
}

export interface SercopProcessData {
  idSoliCompra: string;
  processCode: string;
  entityName: string;
  processUrl: string;
  filesTabUrl: string;
  sourceMode: 'live-sercop' | 'manual-html';
  fetchedAt: string;
  infoFields: SercopInfoField[];
  participants: SercopParticipant[];
  products: SercopProduct[];
  files: SercopFileItem[];
  schedule: SercopScheduleItem[];
  warnings: string[];
}

export interface SercopInspectErrorResponse {
  error: string;
  code: 'INVALID_URL' | 'SERCOP_TIMEOUT' | 'SERCOP_BLOCKED' | 'SERCOP_HTTP_ERROR' | 'PARSE_ERROR';
  idSoliCompra?: string;
  processUrl?: string;
  filesTabUrl?: string;
  details?: string;
}
