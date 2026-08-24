import { Injectable } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  NeptiveActivitySource,
  NeptiveActivityType,
  NeptiveApprovalActionType,
  NeptiveApprovalActorType,
  NeptiveApprovalStatus,
  NeptiveClientUserRole,
  NeptiveDeliverableKind,
  NeptiveEditorialPlanStatus,
  NeptiveReportStatus,
  NeptiveStrategyKind,
  NeptiveVisibility,
  Prisma,
} from '@prisma/client';

@Injectable()
export class NeptiveRepository {
  constructor(private prisma: PrismaService) {}

  customerInOrg(orgId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, orgId, deletedAt: null },
    });
  }

  listCustomers(orgId: string) {
    return this.prisma.customer.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { integrations: { where: { deletedAt: null }, select: { id: true } } },
    });
  }

  liveCustomerByName(orgId: string, name: string) {
    return this.prisma.customer.findFirst({
      where: { orgId, name, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  createCustomer(orgId: string, name: string) {
    return this.prisma.customer.create({ data: { orgId, name } });
  }

  updateCustomerName(orgId: string, customerId: string, name: string) {
    return this.prisma.customer.updateMany({
      where: { id: customerId, orgId, deletedAt: null },
      data: { name },
    });
  }

  softDeleteCustomer(orgId: string, customerId: string) {
    return this.prisma.customer.updateMany({
      where: { id: customerId, orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  profileByCustomer(orgId: string, customerId: string) {
    return this.prisma.neptiveClientProfile.findFirst({
      where: { orgId, customerId, deletedAt: null },
    });
  }

  upsertProfile(
    orgId: string,
    customerId: string,
    data: { website?: string; notes?: string; branding?: Prisma.InputJsonValue }
  ) {
    return this.prisma.neptiveClientProfile.upsert({
      where: { customerId },
      create: { orgId, customerId, ...data },
      update: data,
    });
  }

  listClientUsers(orgId: string, customerId: string) {
    return this.prisma.neptiveClientUser.findMany({
      where: { orgId, customerId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  clientUserById(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveClientUser.findFirst({
      where: { id, orgId, customerId, deletedAt: null },
    });
  }

  clientUserByEmail(orgId: string, customerId: string, email: string) {
    return this.prisma.neptiveClientUser.findFirst({
      where: { orgId, customerId, email: email.toLowerCase(), deletedAt: null },
    });
  }

  createClientUser(data: {
    orgId: string;
    customerId: string;
    email: string;
    name: string;
    role: NeptiveClientUserRole;
  }) {
    return this.prisma.neptiveClientUser.create({
      data: { ...data, email: data.email.toLowerCase() },
    });
  }

  softDeleteClientUser(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveClientUser.updateMany({
      where: { id, orgId, customerId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  touchClientLogin(id: string) {
    return this.prisma.neptiveClientUser.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  createMagicLink(data: {
    tokenHash: string;
    clientUserId: string;
    customerId: string;
    orgId: string;
    expiresAt: Date;
  }) {
    return this.prisma.neptiveMagicLink.create({ data });
  }

  magicLinkByHash(tokenHash: string) {
    return this.prisma.neptiveMagicLink.findUnique({
      where: { tokenHash },
      include: { clientUser: true },
    });
  }

  consumeMagicLink(id: string) {
    return this.prisma.neptiveMagicLink.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  createSession(data: {
    tokenHash: string;
    clientUserId: string;
    customerId: string;
    orgId: string;
    expiresAt: Date;
  }) {
    return this.prisma.neptivePortalSession.create({ data });
  }

  sessionByHash(tokenHash: string) {
    return this.prisma.neptivePortalSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { clientUser: true },
    });
  }

  revokeSession(id: string) {
    return this.prisma.neptivePortalSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  listPeds(orgId: string, customerId: string) {
    return this.prisma.neptiveEditorialPlan.findMany({
      where: { orgId, customerId, deletedAt: null },
      include: { items: { orderBy: { position: 'asc' } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  pedById(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveEditorialPlan.findFirst({
      where: { id, orgId, customerId, deletedAt: null },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  pedByIdUnscoped(id: string) {
    return this.prisma.neptiveEditorialPlan.findFirst({
      where: { id, deletedAt: null },
    });
  }

  createPed(data: {
    orgId: string;
    customerId: string;
    name: string;
    periodStart: Date;
    periodEnd: Date;
    objectives?: string;
    notes?: string;
    createdByUserId?: string;
  }) {
    return this.prisma.neptiveEditorialPlan.create({ data });
  }

  updatePed(
    orgId: string,
    customerId: string,
    id: string,
    data: Prisma.NeptiveEditorialPlanUpdateInput
  ) {
    return this.prisma.neptiveEditorialPlan.updateMany({
      where: { id, orgId, customerId, deletedAt: null },
      data,
    });
  }

  transitionPed(
    orgId: string,
    customerId: string,
    id: string,
    from: NeptiveEditorialPlanStatus,
    to: NeptiveEditorialPlanStatus,
    extra: Prisma.NeptiveEditorialPlanUpdateInput = {}
  ) {
    return this.prisma.neptiveEditorialPlan.updateMany({
      where: { id, orgId, customerId, deletedAt: null, status: from },
      data: { status: to, ...extra },
    });
  }

  addPedItem(data: {
    planId: string;
    title: string;
    notes?: string;
    postGroup?: string;
    position: number;
  }) {
    return this.prisma.neptiveEditorialPlanItem.create({ data });
  }

  deletePedItem(planId: string, itemId: string) {
    return this.prisma.neptiveEditorialPlanItem.deleteMany({
      where: { id: itemId, planId },
    });
  }

  approvalByGroup(orgId: string, postGroup: string) {
    return this.prisma.neptiveContentApproval.findFirst({
      where: { orgId, postGroup, deletedAt: null },
      include: {
        actions: { orderBy: { createdAt: 'desc' } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  approvalById(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveContentApproval.findFirst({
      where: { id, orgId, customerId, deletedAt: null },
      include: {
        actions: { orderBy: { createdAt: 'desc' } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  approvalByIdUnscoped(id: string) {
    return this.prisma.neptiveContentApproval.findFirst({
      where: { id, deletedAt: null },
    });
  }

  listApprovals(orgId: string, customerId: string, status?: NeptiveApprovalStatus) {
    return this.prisma.neptiveContentApproval.findMany({
      where: {
        orgId,
        customerId,
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      include: {
        actions: { orderBy: { createdAt: 'desc' }, take: 5 },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  createApproval(data: {
    orgId: string;
    customerId: string;
    postGroup: string;
    title?: string;
    createdByUserId?: string;
    status?: NeptiveApprovalStatus;
  }) {
    return this.prisma.neptiveContentApproval.create({
      data: { ...data, status: data.status || 'DRAFT' },
    });
  }

  transitionApproval(
    orgId: string,
    customerId: string,
    id: string,
    from: NeptiveApprovalStatus,
    to: NeptiveApprovalStatus,
    extra: Prisma.NeptiveContentApprovalUpdateInput = {}
  ) {
    return this.prisma.neptiveContentApproval.updateMany({
      where: { id, orgId, customerId, deletedAt: null, status: from },
      data: { status: to, ...extra },
    });
  }

  addApprovalAction(data: {
    approvalId: string;
    actorType: NeptiveApprovalActorType;
    actorId?: string;
    action: NeptiveApprovalActionType;
    comment?: string;
  }) {
    return this.prisma.neptiveApprovalAction.create({ data });
  }

  addApprovalComment(data: {
    approvalId: string;
    visibility: NeptiveVisibility;
    authorType: NeptiveApprovalActorType;
    authorId?: string;
    authorName: string;
    body: string;
  }) {
    return this.prisma.neptiveApprovalComment.create({ data });
  }

  listStrategy(orgId: string, customerId: string, clientVisibleOnly: boolean) {
    return this.prisma.neptiveStrategyEntry.findMany({
      where: {
        orgId,
        customerId,
        deletedAt: null,
        ...(clientVisibleOnly ? { visibility: 'CLIENT_VISIBLE' } : {}),
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  strategyById(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveStrategyEntry.findFirst({
      where: { id, orgId, customerId, deletedAt: null },
    });
  }

  strategyByIdUnscoped(id: string) {
    return this.prisma.neptiveStrategyEntry.findFirst({
      where: { id, deletedAt: null },
    });
  }

  createStrategy(data: {
    orgId: string;
    customerId: string;
    kind: NeptiveStrategyKind;
    title: string;
    body?: string;
    visibility?: NeptiveVisibility;
  }) {
    return this.prisma.neptiveStrategyEntry.create({ data });
  }

  updateStrategy(
    orgId: string,
    customerId: string,
    id: string,
    data: Prisma.NeptiveStrategyEntryUpdateInput
  ) {
    return this.prisma.neptiveStrategyEntry.updateMany({
      where: { id, orgId, customerId, deletedAt: null },
      data,
    });
  }

  deleteStrategy(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveStrategyEntry.updateMany({
      where: { id, orgId, customerId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  listActivities(
    orgId: string,
    customerId: string,
    clientVisibleOnly: boolean
  ) {
    return this.prisma.neptiveActivity.findMany({
      where: {
        orgId,
        customerId,
        deletedAt: null,
        ...(clientVisibleOnly ? { visibility: 'CLIENT_VISIBLE' } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  activityByIdUnscoped(id: string) {
    return this.prisma.neptiveActivity.findFirst({
      where: { id, deletedAt: null },
    });
  }

  createActivity(data: {
    orgId: string;
    customerId: string;
    type: NeptiveActivityType;
    title: string;
    body?: string;
    visibility?: NeptiveVisibility;
    source?: NeptiveActivitySource;
    relatedPostGroup?: string;
    relatedPlanId?: string;
    performedByUserId?: string;
  }) {
    return this.prisma.neptiveActivity.create({ data });
  }

  listDeliverables(
    orgId: string,
    customerId: string,
    clientVisibleOnly: boolean
  ) {
    return this.prisma.neptiveDeliverable.findMany({
      where: {
        orgId,
        customerId,
        deletedAt: null,
        ...(clientVisibleOnly ? { visibility: 'CLIENT_VISIBLE' } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  deliverableById(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveDeliverable.findFirst({
      where: { id, orgId, customerId, deletedAt: null },
    });
  }

  deliverableByIdUnscoped(id: string) {
    return this.prisma.neptiveDeliverable.findFirst({
      where: { id, deletedAt: null },
    });
  }

  createDeliverable(data: {
    orgId: string;
    customerId: string;
    title: string;
    description?: string;
    kind?: NeptiveDeliverableKind;
    mediaId?: string;
    filePath?: string;
    visibility?: NeptiveVisibility;
    createdByUserId?: string;
  }) {
    return this.prisma.neptiveDeliverable.create({ data });
  }

  deleteDeliverable(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveDeliverable.updateMany({
      where: { id, orgId, customerId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  listReports(orgId: string, customerId: string, publishedOnly: boolean) {
    return this.prisma.neptiveReport.findMany({
      where: {
        orgId,
        customerId,
        deletedAt: null,
        ...(publishedOnly ? { status: 'PUBLISHED' } : {}),
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  reportById(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveReport.findFirst({
      where: { id, orgId, customerId, deletedAt: null },
    });
  }

  reportByIdUnscoped(id: string) {
    return this.prisma.neptiveReport.findFirst({
      where: { id, deletedAt: null },
    });
  }

  createReport(data: {
    orgId: string;
    customerId: string;
    title: string;
    periodStart: Date;
    periodEnd: Date;
    narrative?: string;
    snapshot?: Prisma.InputJsonValue;
    status?: NeptiveReportStatus;
    publishedAt?: Date;
  }) {
    return this.prisma.neptiveReport.create({ data });
  }

  publishReport(orgId: string, customerId: string, id: string) {
    return this.prisma.neptiveReport.updateMany({
      where: { id, orgId, customerId, deletedAt: null },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  countApprovalsByStatus(orgId: string, customerId: string) {
    return this.prisma.neptiveContentApproval.groupBy({
      by: ['status'],
      where: { orgId, customerId, deletedAt: null },
      _count: { _all: true },
    });
  }
}
