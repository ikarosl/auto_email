export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly code = 'BUSINESS_ERROR',
  ) {
    super(message);
    this.name = BusinessError.name;
  }
}
