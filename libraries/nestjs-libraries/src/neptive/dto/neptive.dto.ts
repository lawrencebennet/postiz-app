import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateNeptiveClientDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateNeptiveClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateNeptivePreviewIdentityDto {
  @IsOptional()
  @IsString()
  instagramName?: string;

  @IsOptional()
  @IsString()
  instagramImage?: string;

  @IsOptional()
  @IsString()
  facebookName?: string;

  @IsOptional()
  @IsString()
  facebookImage?: string;
}

export class InviteNeptiveClientUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsIn(['CLIENT_ADMIN', 'CLIENT_MEMBER'])
  role?: 'CLIENT_ADMIN' | 'CLIENT_MEMBER';
}

export class CreateNeptivePedDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsString()
  objectives?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateNeptivePedDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @IsOptional()
  @IsString()
  objectives?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransitionNeptivePedDto {
  @IsIn([
    'DRAFT',
    'INTERNAL_REVIEW',
    'CLIENT_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
    'ACTIVE',
    'COMPLETED',
  ])
  status: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateNeptivePedItemDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  postGroup?: string;
}

export class CreateNeptiveApprovalDto {
  @IsString()
  @MinLength(1)
  postGroup: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class TransitionNeptiveApprovalDto {
  @IsIn([
    'PENDING_INTERNAL_REVIEW',
    'PENDING_CLIENT_APPROVAL',
    'CHANGES_REQUESTED',
    'REJECTED',
    'APPROVED',
    'DRAFT',
  ])
  status: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateNeptiveApprovalCommentDto {
  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsIn(['INTERNAL', 'CLIENT_VISIBLE'])
  visibility?: 'INTERNAL' | 'CLIENT_VISIBLE';
}

export class CreateNeptiveStrategyDto {
  @IsIn([
    'OBJECTIVE',
    'AUDIENCE',
    'POSITIONING',
    'PILLAR',
    'TONE',
    'PLATFORM',
    'PRIORITY',
    'EXPERIMENT',
    'CAMPAIGN',
    'KPI',
    'NOTE',
  ])
  kind: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(['INTERNAL', 'CLIENT_VISIBLE'])
  visibility?: 'INTERNAL' | 'CLIENT_VISIBLE';
}

export class UpdateNeptiveStrategyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(['INTERNAL', 'CLIENT_VISIBLE'])
  visibility?: 'INTERNAL' | 'CLIENT_VISIBLE';
}

export class CreateNeptiveActivityDto {
  @IsIn([
    'PROFILE_OPTIMIZATION',
    'COMPETITOR_ANALYSIS',
    'CAMPAIGN_ADJUSTMENT',
    'MEETING',
    'CREATIVE_PRODUCTION',
    'STRATEGY_UPDATE',
    'REPORT_PREPARATION',
    'WEBSITE_SOCIAL_INTERVENTION',
    'OTHER',
  ])
  type: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(['INTERNAL', 'CLIENT_VISIBLE'])
  visibility?: 'INTERNAL' | 'CLIENT_VISIBLE';
}

export class CreateNeptiveDeliverableDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn([
    'BRAND_GUIDELINES',
    'REPORT_PDF',
    'STRATEGY_DOCUMENT',
    'RAW_PHOTO',
    'CLIENT_MATERIAL',
    'CAMPAIGN_ASSET',
    'DELIVERABLE',
  ])
  kind?: string;

  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsOptional()
  @IsString()
  filePath?: string;

  @IsOptional()
  @IsIn(['INTERNAL', 'CLIENT_VISIBLE'])
  visibility?: 'INTERNAL' | 'CLIENT_VISIBLE';
}

export class GenerateNeptiveReportDto {
  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  narrative?: string;
}

export class ConsumeNeptiveMagicLinkDto {
  @IsString()
  @MinLength(10)
  token: string;
}
