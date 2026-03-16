import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

/**
 * In production (ng build), there is no dev-server proxy.
 * This interceptor prepends the full BE base URL to every /api/* request.
 * In development (ng serve), apiBase is empty so the proxy.conf.json takes over.
 */
export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (environment.apiBase && req.url.startsWith('/api')) {
    const apiReq = req.clone({ url: `${environment.apiBase}${req.url}` });
    return next(apiReq);
  }
  return next(req);
};
