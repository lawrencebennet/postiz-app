import { ForbiddenException, Injectable } from '@nestjs/common';
import { NeptiveDeliverableKind, NeptiveVisibility } from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { NeptiveClientService } from '@gitroom/nestjs-libraries/neptive/services/client.service';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { notFoundIfMissing } from '@gitroom/nestjs-libraries/neptive/domain/scope';
import { CreateNeptiveDeliverableDto } from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';

@Injectable()
export class NeptiveDeliverableService {
  constructor(
    private repo: NeptiveRepository,
    private clients: NeptiveClientService,
    private postiz: PostizAdapter
  ) {}

  async list(
    orgId: string,
    customerId: string,
    clientVisibleOnly = false
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    return this.repo.listDeliverables(orgId, customerId, clientVisibleOnly);
  }

  async getOrForbid(orgId: string, customerId: string, id: string) {
    const unscoped = await this.repo.deliverableByIdUnscoped(id);
    if (
      unscoped &&
      (unscoped.orgId !== orgId || unscoped.customerId !== customerId)
    ) {
      throw new ForbiddenException();
    }
    return notFoundIfMissing(
      await this.repo.deliverableById(orgId, customerId, id)
    );
  }

  async create(
    orgId: string,
    customerId: string,
    userId: string,
    body: CreateNeptiveDeliverableDto
  ) {
    await this.clients.assertCustomer(orgId, customerId);
    if (body.mediaId) {
      const media = await this.postiz.mediaById(orgId, body.mediaId);
      if (!media) {
        throw new ForbiddenException();
      }
    }
    return this.repo.createDeliverable({
      orgId,
      customerId,
      title: body.title,
      description: body.description,
      kind: (body.kind as NeptiveDeliverableKind) || 'DELIVERABLE',
      mediaId: body.mediaId,
      filePath: body.filePath,
      visibility: (body.visibility as NeptiveVisibility) || 'CLIENT_VISIBLE',
      createdByUserId: userId,
    });
  }

  async remove(orgId: string, customerId: string, id: string) {
    await this.getOrForbid(orgId, customerId, id);
    await this.repo.deleteDeliverable(orgId, customerId, id);
    return { ok: true };
  }
}
