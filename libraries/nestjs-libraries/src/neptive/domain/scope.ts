import { ForbiddenException, NotFoundException } from '@nestjs/common';

export function assertSameCustomer(
  sessionCustomerId: string,
  resourceCustomerId: string | undefined
) {
  if (!resourceCustomerId || resourceCustomerId !== sessionCustomerId) {
    throw new ForbiddenException();
  }
}

export function notFoundIfMissing<T>(row: T | null | undefined): T {
  if (!row) {
    throw new NotFoundException();
  }
  return row;
}
