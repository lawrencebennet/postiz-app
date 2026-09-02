'use client';

import { FC, useEffect, useMemo, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import clsx from 'clsx';
import {
  normalizePreviewContent,
  type PlatformPreviewModel,
  type PreviewContent,
  type PreviewMedia,
  type PreviewPlatform,
} from '@gitroom/nestjs-libraries/neptive/domain/preview-model';
import {
  normalizePreviewIdentity,
  type PreviewIdentity,
} from '@gitroom/nestjs-libraries/neptive/domain/preview-identity';
import { NeptiveBadge, formatWhen, statusTone } from '@gitroom/frontend/components/neptive/neptive.ui';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

const MediaSurface: FC<{
  media: PreviewMedia;
  className?: string;
  contain?: boolean;
}> = ({ media, className, contain = false }) =>
  media.type === 'video' ? (
    <video
      src={media.path}
      poster={media.thumbnail}
      controls
      playsInline
      preload="metadata"
      className={clsx('h-full w-full bg-black', contain ? 'object-contain' : 'object-cover', className)}
      aria-label={media.alt || 'Anteprima video'}
    />
  ) : (
    <img
      src={media.path}
      alt={media.alt || 'Anteprima contenuto'}
      className={clsx('h-full w-full', contain ? 'object-contain' : 'object-cover', className)}
    />
  );

export const ProfileHeader: FC<{
  name: string;
  image?: string | null;
  eyebrow?: string;
  dark?: boolean;
}> = ({ name, image, eyebrow, dark = false }) => (
  <div className="flex items-center gap-[10px]">
    {image ? (
      <img src={image} alt="" className="h-[38px] w-[38px] rounded-full object-cover" />
    ) : (
      <div className={clsx('h-[38px] w-[38px] rounded-full flex items-center justify-center text-[12px] font-[700]', dark ? 'bg-white/15 text-white' : 'bg-slate-200 text-slate-700')}>
        {initials(name)}
      </div>
    )}
    <div className="min-w-0">
      <div className={clsx('truncate text-[13px] font-[700]', dark ? 'text-white' : 'text-slate-900')}>{name}</div>
      {eyebrow && <div className={clsx('truncate text-[11px]', dark ? 'text-white/55' : 'text-slate-500')}>{eyebrow}</div>}
    </div>
  </div>
);

export const PreviewMediaCarousel: FC<{
  media: PreviewMedia[];
  label?: string;
  dark?: boolean;
  contain?: boolean;
  className?: string;
}> = ({ media, label = 'Media preview', dark = false, contain = true, className }) => {
  const [viewportRef] = useEmblaCarousel({ loop: false, watchDrag: true });

  if (!media.length) {
    return <div className={clsx('flex min-h-[280px] items-center justify-center bg-slate-100 text-[13px] text-slate-500', className)}>Nessun media collegato</div>;
  }

  return (
    <div className={clsx('relative overflow-hidden', className)}>
      <div ref={viewportRef} className="overflow-hidden touch-pan-y" aria-label={label}>
        <div className="flex">
          {media.map((item, index) => (
            <div key={item.id || `${item.path}-${index}`} className="min-w-0 flex-[0_0_100%] select-none">
              <div className="relative aspect-[3/4] w-full bg-black">
                <MediaSurface media={item} contain={contain} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Caption: FC<{ text: string; dark?: boolean }> = ({ text, dark = false }) => (
  <div className={clsx('text-[13px] leading-[1.45] whitespace-pre-wrap break-words', dark ? 'text-white/90' : 'text-slate-800')}>
    {text || <span className={dark ? 'text-white/45' : 'text-slate-400'}>Nessuna caption</span>}
  </div>
);

export const InstagramPreviewCard: FC<{ model: PlatformPreviewModel }> = ({ model }) => (
  <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[14px] bg-[#101010] text-white shadow-2xl ring-1 ring-white/10">
    <div className="p-[14px]">
      <ProfileHeader name={model.profile.name} image={model.profile.image} eyebrow="Instagram" dark />
    </div>
    <PreviewMediaCarousel media={model.media} label="Instagram carousel preview" dark />
    <div className="p-[14px]"><Caption text={model.caption} dark /></div>
  </div>
);

export const FacebookPreviewCard: FC<{
  model: PlatformPreviewModel;
  onOpenDetail: () => void;
}> = ({ model, onOpenDetail }) => (
  <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[14px] bg-white text-slate-900 shadow-2xl ring-1 ring-black/10">
    <div className="p-[16px] pb-[10px]">
      <ProfileHeader name={model.profile.name} image={model.profile.image} eyebrow="Pagina Facebook" />
    </div>
    <PreviewMediaCarousel media={model.media} label="Facebook gallery preview" />
    <div className="p-[16px] pt-[14px]"><Caption text={model.caption} /></div>
    <button type="button" onClick={onOpenDetail} className="m-[12px] w-[calc(100%-24px)] rounded-[8px] bg-slate-100 px-[12px] py-[9px] text-[12px] font-[700] text-slate-700 hover:bg-slate-200">Apri dettaglio Facebook</button>
  </div>
);

export const FacebookPreviewDetail: FC<{
  model: PlatformPreviewModel;
  onBack: () => void;
}> = ({ model, onBack }) => (
  <div className="mx-auto w-full max-w-[700px] overflow-hidden rounded-[14px] bg-white text-slate-900 shadow-2xl ring-1 ring-black/10">
    <div className="flex items-center gap-[10px] border-b border-slate-200 p-[14px]"><button type="button" onClick={onBack} className="text-[22px] text-slate-500" aria-label="Torna alla preview Facebook">‹</button><span className="text-[14px] font-[700]">Dettaglio post Facebook</span></div>
    <div className="p-[16px]"><ProfileHeader name={model.profile.name} image={model.profile.image} eyebrow={`Pubblicazione · ${formatWhen(model.scheduledAt)}`} /></div>
    <div className="px-[16px] pb-[16px]"><Caption text={model.caption} /></div>
    <PreviewMediaCarousel media={model.media} label="Facebook post detail preview" />
    <div className="p-[16px]"><NeptiveBadge tone={statusTone(model.publishingState)}>{model.publishingState}</NeptiveBadge></div>
  </div>
);

export const PlatformPreviewSwitcher: FC<{
  content: PreviewContent;
  identity?: PreviewIdentity | unknown;
}> = ({ content, identity }) => {
  const [platform, setPlatform] = useState<PreviewPlatform>('instagram');
  const [facebookDetail, setFacebookDetail] = useState(false);
  const safeIdentity = useMemo(() => normalizePreviewIdentity(identity), [identity]);
  const model = useMemo(() => normalizePreviewContent(content, safeIdentity, platform), [content, platform, safeIdentity]);
  const facebookModel = useMemo(() => normalizePreviewContent(content, safeIdentity, 'facebook'), [content, safeIdentity]);

  useEffect(() => setFacebookDetail(false), [content.postGroup]);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <div><div className="text-[11px] uppercase tracking-[0.1em] text-newTableText">Anteprima piattaforma</div><div className="text-[13px] text-newTableText">Il media e il testo arrivano dal contenuto Postiz collegato.</div></div>
        <div className="flex rounded-[8px] bg-newBgColorInner p-[3px]" role="tablist" aria-label="Scegli anteprima">
          {(['instagram', 'facebook'] as PreviewPlatform[]).map((item) => <button key={item} type="button" role="tab" aria-selected={platform === item} onClick={() => { setPlatform(item); setFacebookDetail(false); }} className={clsx('rounded-[6px] px-[10px] py-[7px] text-[11px] font-[700]', platform === item ? 'bg-boxFocused text-textItemFocused' : 'text-newTableText')}>{item === 'instagram' ? 'Instagram preview' : 'Facebook preview'}</button>)}
        </div>
      </div>
      {platform === 'instagram' ? <InstagramPreviewCard model={model} /> : facebookDetail ? <FacebookPreviewDetail model={facebookModel} onBack={() => setFacebookDetail(false)} /> : <FacebookPreviewCard model={facebookModel} onOpenDetail={() => setFacebookDetail(true)} />}
    </div>
  );
};
