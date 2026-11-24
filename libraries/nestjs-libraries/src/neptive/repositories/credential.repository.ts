import { Injectable } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { NeptiveCredentialSource } from '@prisma/client';

// Everything that reads or writes neptive_client_credentials / neptive_login_attempts.
// Only loginCandidates and credentialForUser return a password hash, and only to
// NeptivePortalCredentialsService, which never puts it in a response.
export const CREDENTIAL_SUMMARY_SELECT = {
  clientUserId: true,
  source: true,
  mustChange: true,
  updatedAt: true,
} as const;

export type NeptiveCredentialSummary = {
  clientUserId: string;
  source: NeptiveCredentialSource;
  mustChange: boolean;
  updatedAt: Date;
};

@Injectable()
export class NeptiveCredentialRepository {
  constructor(private prisma: PrismaService) {}

  /** live, activated users with this email that have a password, in a live customer (any org) */
  async loginCandidates(email: string) {
    const users = await this.prisma.neptiveClientUser.findMany({
      where: {
        email,
        deletedAt: null,
        activated: true,
        credential: { isNot: null },
      },
      include: { credential: true },
      orderBy: { createdAt: 'asc' },
    });
    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: users.map((user) => user.customerId) },
        deletedAt: null,
        // live organization too (same rule as a session: NeptivePortalAuthService.resolve)
        orgId: {
          in: (
            await this.prisma.organization.findMany({
              where: { id: { in: users.map((user) => user.orgId) }, deletedAt: null },
              select: { id: true },
            })
          ).map((org) => org.id),
        },
      },
      select: { id: true, orgId: true, name: true },
    });
    return users
      .map((user) => {
        const customer = customers.find(
          (row) => row.id === user.customerId && row.orgId === user.orgId
        );
        return customer && user.credential
          ? {
              id: user.id,
              orgId: user.orgId,
              customerId: user.customerId,
              customerName: customer.name,
              email: user.email,
              name: user.name,
              passwordHash: user.credential.passwordHash,
              mustChange: user.credential.mustChange,
            }
          : null;
      })
      .filter(<T>(row: T | null): row is T => !!row);
  }

  /** live users with this email (for the throttling activity record); no credential data */
  liveUsersByEmail(email: string) {
    return this.prisma.neptiveClientUser.findMany({
      where: { email, deletedAt: null },
      select: { id: true, orgId: true, customerId: true, name: true },
    });
  }

  credentialForUser(clientUserId: string) {
    return this.prisma.neptiveClientCredential.findUnique({
      where: { clientUserId },
    });
  }

  credentialSummary(clientUserId: string): Promise<NeptiveCredentialSummary | null> {
    return this.prisma.neptiveClientCredential.findUnique({
      where: { clientUserId },
      select: CREDENTIAL_SUMMARY_SELECT,
    });
  }

  credentialSummaries(
    orgId: string,
    customerId: string
  ): Promise<NeptiveCredentialSummary[]> {
    return this.prisma.neptiveClientCredential.findMany({
      where: { orgId, customerId },
      select: CREDENTIAL_SUMMARY_SELECT,
    });
  }

  saveCredential(data: {
    clientUserId: string;
    orgId: string;
    customerId: string;
    passwordHash: string;
    source: NeptiveCredentialSource;
    mustChange: boolean;
    setByUserId: string | null;
  }) {
    const { clientUserId, ...rest } = data;
    return this.prisma.neptiveClientCredential.upsert({
      where: { clientUserId },
      create: data,
      update: rest,
      select: CREDENTIAL_SUMMARY_SELECT,
    });
  }

  deleteCredential(clientUserId: string) {
    return this.prisma.neptiveClientCredential.deleteMany({
      where: { clientUserId },
    });
  }

  revokeUserSessions(clientUserId: string) {
    return this.prisma.neptivePortalSession.updateMany({
      where: { clientUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  createSession(data: {
    tokenHash: string;
    clientUserId: string;
    customerId: string;
    orgId: string;
    expiresAt: Date;
    passwordChangeRequired: boolean;
  }) {
    return this.prisma.neptivePortalSession.create({ data });
  }

  async failures(bucket: string, since: Date) {
    const [count, oldest] = await Promise.all([
      this.prisma.neptiveLoginAttempt.count({
        where: { bucket, createdAt: { gt: since } },
      }),
      this.prisma.neptiveLoginAttempt.findFirst({
        where: { bucket, createdAt: { gt: since } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return { count, oldest: oldest?.createdAt || null };
  }

  async addFailures(buckets: string[]) {
    await this.prisma.neptiveLoginAttempt.createMany({
      data: buckets.map((bucket) => ({ bucket })),
    });
    await this.prisma.neptiveLoginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  }
}
