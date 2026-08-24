import { ForbiddenException, Injectable } from '@nestjs/common';
import { NeptiveStrategyKind, NeptiveVisibility } from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { notFoundIfMissing } from '@gitroom/nestjs-libraries/neptive/domain/scope';
import {
  CreateNeptiveStrategyDto,
  UpdateNeptiveStrategyDto,
} from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';

@Injectable()
export class NeptiveStrategyService {
  constructor(
    private repo: NeptiveRepository,
    private clients: NeptiveClientService
  ) {}

  async list(
    orgId: string,
    customerId: string,
    clientVisibleOnly = false
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.repo.listStrategy(orgId, customerId, clientVisibleOnly);
  }

  async getOrForbid(orgId: string, customerId: string, id: string) {
    const unscoped = await this.repo.strategyByIdUnscoped(id);
    if (
      unscoped &&
      (unscoped.orgId !== orgId || unscoped.customerId !== customerId)
    ) {
      throw new ForbiddenException();
    }
    return notFoundIfMissing(
      await this.repo.strategyById(orgId, customerId, id)
    );
  }

  async create(
    orgId: string,
    customerId: string,
    body: CreateNeptiveStrategyDto
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.repo.createStrategy({
      orgId,
      customerId,
      kind: body.kind as NeptiveStrategyKind,
      title: body.title,
      body: body.body,
      visibility: (body.visibility as NeptiveVisibility) || 'CLIENT_VISIBLE',
    });
  }

  async update(
    orgId: string,
    customerId: string,
    id: string,
    body: UpdateNeptiveStrategyDto
  ) {
    await this.getOrForbid(orgId, customerId, id);
    await this.repo.updateStrategy(orgId, customerId, id, {
      ...(body.title ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.visibility
        ? { visibility: body.visibility as NeptiveVisibility }
        : {}),
    });
    return this.getOrForbid(orgId, customerId, id);
  }

  async remove(orgId: string, customerId: string, id: string) {
    await this.getOrForbid(orgId, customerId, id);
    await this.repo.deleteStrategy(orgId, customerId, id);
    return { ok: true };
  }
}
