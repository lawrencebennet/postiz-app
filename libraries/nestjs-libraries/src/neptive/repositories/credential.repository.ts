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

  /**
   * Client sets or changes their own password. One transaction: the credential is written only if it is
   * still the one the client proved (same hash; or still absent for a first password), then every session
   * of the user is revoked and the new session row is created. Returns null when the credential changed
   * underneath (agency reset or removal in between): nothing is written.
   *
   * Postgres READ COMMITTED: a concurrent agency write holds the row lock; this UPDATE waits for it and
   * then re-checks its WHERE on the committed row (new hash, or no row) and matches nothing.
   */
  replaceOwnCredential(input: {
    clientUserId: string;
    orgId: string;
    customerId: string;
    expectedHash: string | null;
    passwordHash: string;
    session: { tokenHash: string; expiresAt: Date };
  }) {
    const { clientUserId, orgId, customerId, expectedHash, passwordHash, session } = input;
    return this.prisma.$transaction(async (tx) => {
      const data = { passwordHash, source: 'CLIENT' as const, mustChange: false, setByUserId: null };
      const written = expectedHash
        ? await tx.neptiveClientCredential.updateMany({
            where: { clientUserId, passwordHash: expectedHash },
            data,
          })
        : // ON CONFLICT DO NOTHING: an agency password created meanwhile wins, the client gets a conflict
          await tx.neptiveClientCredential.createMany({
            data: [{ clientUserId, orgId, customerId, ...data }],
            skipDuplicates: true,
          });
      if (!written.count) {
        return null;
      }
      await tx.neptivePortalSession.updateMany({
        where: { clientUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.neptivePortalSession.create({
        data: {
          tokenHash: session.tokenHash,
          clientUserId,
          customerId,
          orgId,
          expiresAt: session.expiresAt,
          passwordChangeRequired: false,
        },
      });
    });
  }

  /** agency temporary password: credential write + revocation of all the user's sessions, one transaction */
  setAgencyCredential(data: {
    clientUserId: string;
    orgId: string;
    customerId: string;
    passwordHash: string;
    setByUserId: string | null;
  }): Promise<NeptiveCredentialSummary> {
    const { clientUserId } = data;
    const fields = {
      passwordHash: data.passwordHash,
      source: 'AGENCY' as const,
      mustChange: true,
      setByUserId: data.setByUserId,
    };
    return this.prisma.$transaction(async (tx) => {
      // update, else insert, else (a client insert won the race) update the row that now exists
      let written = await tx.neptiveClientCredential.updateMany({ where: { clientUserId }, data: fields });
      if (!written.count) {
        written = await tx.neptiveClientCredential.createMany({
          data: [{ clientUserId, orgId: data.orgId, customerId: data.customerId, ...fields }],
          skipDuplicates: true,
        });
      }
      if (!written.count) {
        await tx.neptiveClientCredential.updateMany({ where: { clientUserId }, data: fields });
      }
      await tx.neptivePortalSession.updateMany({
        where: { clientUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.neptiveClientCredential.findUniqueOrThrow({
        where: { clientUserId },
        select: CREDENTIAL_SUMMARY_SELECT,
      });
    });
  }

  /** agency removal: credential delete + revocation of all the user's sessions, one transaction */
  removeCredential(clientUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.neptiveClientCredential.deleteMany({ where: { clientUserId } });
      if (removed.count) {
        await tx.neptivePortalSession.updateMany({
          where: { clientUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return removed;
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
