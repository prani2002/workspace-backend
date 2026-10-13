export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'unauthorized') => new HttpError(401, code, message);
export const forbidden = (message = 'You do not have access to this resource', code = 'forbidden') => new HttpError(403, code, message);
export const notFound = (message = 'Resource not found', code = 'not_found') => new HttpError(404, code, message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
