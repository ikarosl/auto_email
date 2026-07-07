import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';

import { BusinessError } from '../errors/business-error.js';

interface HttpResponse {
  status(code: number): {
    json(body: unknown): void;
  };
}

@Catch(BusinessError)
export class BusinessErrorFilter implements ExceptionFilter {
  catch(exception: BusinessError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    response.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      code: exception.code,
      message: exception.message,
    });
  }
}
