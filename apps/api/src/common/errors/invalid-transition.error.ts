import { BusinessError } from './business-error.js';

export class InvalidTransitionError extends BusinessError {
  constructor(message: string) {
    super(message, 'INVALID_INQUIRY_STATUS_TRANSITION');
    this.name = InvalidTransitionError.name;
  }
}
