import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { NeptiveClientUserRole } from '@prisma/client';
import { NeptiveRepository } from '@gitroom/nestjs-libraries/neptive/repositories/neptive.repository';
import { PostizAdapter } from '@gitroom/nestjs-libraries/neptive/adapters/postiz.adapter';
import { hashNeptiveToken, newNeptiveToken } from '@gitroom/nestjs-libraries/neptive/domain/tokens';
import {
  CreateNeptiveClientDto,
  InviteNeptiveClientUserDto,
  UpdateNeptiveClientDto,
} from '@gitroom/nestjs-libraries/neptive/dto/neptive.dto';
import { notFoundIfMissing } from '@gitroom/nestjs-libraries/neptive/domain/scope';

@Injectable()
export class NeptiveClientService {
  constructor(
    private repo: NeptiveRepository,
    private postiz: PostizAdapter,
    private email: EmailService
  ) {}

  async assertCustomer(orgId: string, customerId: string) {
    const customer = await this.repo.customerInOrg(orgId, customerId);
    return notFoundIfMissing(customer);
  }

  async list(orgId: string) {
    const customers = await this.repo.listCustomers(orgId);
    const rows = await Promise.all(
      customers.map(async (customer) => {
        const profile =
          (await this.repo.profileByCustomer(orgId, customer.id)) ||
          (await this.repo.upsertProfile(orgId, customer.id, {}));
        return {
          id: customer.id,
          name: customer.name,
          website: profile.website,
          notes: profile.notes,
          branding: profile.branding,
          channelCount: customer.integrations.length,
          createdAt: customer.createdAt,
        };
      })
    );
    return rows.sort(
      (a, b) =>
        b.channelCount - a.channelCount || a.name.localeCompare(b.name)
    );
  }

  async get(orgId: string, customerId: string) {
    const customer = await this.assertCustomer(orgId, customerId);
    const profile =
      (await this.repo.profileByCustomer(orgId, customerId)) ||
      (await this.repo.upsertProfile(orgId, customerId, {}));
    const channels = await this.postiz.integrationsForCustomer(
      orgId,
      customerId
    );
    const users = await this.repo.listClientUsers(orgId, customerId);
    return {
      id: customer.id,
      name: customer.name,
      website: profile.website,
      notes: profile.notes,
      branding: profile.branding,
      channels: channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        provider: channel.providerIdentifier,
        picture: channel.picture,
        disabled: channel.disabled,
      })),
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLoginAt: user.lastLoginAt,
      })),
    };
  }

  async create(orgId: string, body: CreateNeptiveClientDto) {
    const name = body.name.trim();
    const existing = await this.repo.liveCustomerByName(orgId, name);
    if (existing) {
      throw new BadRequestException('A client with this name already exists');
    }
    try {
      const customer = await this.repo.createCustomer(orgId, name);
      await this.repo.upsertProfile(orgId, customer.id, {
        website: body.website,
        notes: body.notes,
      });
      return this.get(orgId, customer.id);
    } catch {
      throw new BadRequestException('A client with this name already exists');
    }
  }

  async update(orgId: string, customerId: string, body: UpdateNeptiveClientDto) {
    await this.assertCustomer(orgId, customerId);
    if (body.name) {
      await this.repo.updateCustomerName(orgId, customerId, body.name.trim());
    }
    await this.repo.upsertProfile(orgId, customerId, {
      website: body.website,
      notes: body.notes,
    });
    return this.get(orgId, customerId);
  }

  async remove(orgId: string, customerId: string) {
    await this.assertCustomer(orgId, customerId);
    await this.repo.softDeleteCustomer(orgId, customerId);
    return { ok: true };
  }

  async inviteUser(
    orgId: string,
    customerId: string,
    body: InviteNeptiveClientUserDto
  ) {
    await this.assertCustomer(orgId, customerId);
    const existing = await this.repo.clientUserByEmail(
      orgId,
      customerId,
      body.email
    );
    const user =
      existing ||
      (await this.repo.createClientUser({
        orgId,
        customerId,
        email: body.email,
        name: body.name,
        role: (body.role as NeptiveClientUserRole) || 'CLIENT_MEMBER',
      }));
    const token = newNeptiveToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.repo.createMagicLink({
      tokenHash: hashNeptiveToken(token),
      clientUserId: user.id,
      customerId,
      orgId,
      expiresAt,
    });
    const url = `${process.env.FRONTEND_URL}/portal/magic/${token}`;
    try {
      await this.email.sendEmail(
        user.email,
        'Your Neptive client portal link',
        `Click <a href="${url}">here</a> to open your client portal. This link expires in 30 days.`,
        'top'
      );
    } catch {}
    return { id: user.id, email: user.email, url };
  }

  async removeUser(orgId: string, customerId: string, userId: string) {
    await this.assertCustomer(orgId, customerId);
    const user = await this.repo.clientUserById(orgId, customerId, userId);
    if (!user) {
      throw new NotFoundException();
    }
    await this.repo.softDeleteClientUser(orgId, customerId, userId);
    return { ok: true };
  }
}
