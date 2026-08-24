import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetNeptivePortal = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().neptivePortal;
  }
);
