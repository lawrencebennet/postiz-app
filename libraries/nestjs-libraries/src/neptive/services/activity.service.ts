import { Injectable } from '@nestjs/common';
import { NeptiveActivityType, NeptiveVisibility } from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { notFoundIfMissing } from '@gitroom/nestjs-libraries/neptive/domain/scope';
import { CreateNeptiveActivityDto } from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class NeptiveActivityService {
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
    return this.repo.listActivities(orgId, customerId, clientVisibleOnly);
  }

  async create(
    orgId: string,
    customerId: string,
    userId: string | undefined,
    body: CreateNeptiveActivityDto
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.repo.createActivity({
      orgId,
      customerId,
      type: body.type as NeptiveActivityType,
      title: body.title,
      body: body.body,
      visibility: (body.visibility as NeptiveVisibility) || 'CLIENT_VISIBLE',
      source: 'MANUAL',
      performedByUserId: userId,
    });
  }

  async system(
    orgId: string,
    customerId: string,
    data: {
      type: NeptiveActivityType;
      title: string;
      relatedPostGroup?: string;
      relatedPlanId?: string;
    }
  ) {
    return this.repo.createActivity({
      orgId,
      customerId,
      type: data.type,
      title: data.title,
      visibility: 'CLIENT_VISIBLE',
      source: 'SYSTEM',
      relatedPostGroup: data.relatedPostGroup,
      relatedPlanId: data.relatedPlanId,
    });
  }

  async getOrForbid(orgId: string, customerId: string, id: string) {
    const unscoped = await this.repo.activityByIdUnscoped(id);
    if (
      unscoped &&
      (unscoped.orgId !== orgId || unscoped.customerId !== customerId)
    ) {
      throw new ForbiddenException();
    }
    return notFoundIfMissing(unscoped);
  }
}
