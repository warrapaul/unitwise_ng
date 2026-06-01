export interface ErrorResponse {
  status: number;
  errorCode: string;
  message: string;
  details?: string[];
  timestamp: string;
  path: string;
}
