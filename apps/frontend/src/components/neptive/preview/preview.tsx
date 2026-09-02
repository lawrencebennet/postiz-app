'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  NeptiveBadge,
  formatWhen,
  statusTone,
} from '@gitroom/frontend/components/neptive/neptive.ui';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

const mediaLabel = (model: PlatformPreviewModel) => {
  if (model.contentType === 'CAROUSEL' || model.media.length > 1) {
    return `Carosello · ${model.media.length} ${model.media.length === 1 ? 'contenuto' : 'contenuti'}`;
  }
  if (model.contentType === 'REEL') return 'Reel';
  if (model.contentType === 'STORY') return 'Story';
  if (model.contentType === 'VIDEO') return 'Video';
  return 'Post';
};

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
  const [viewportRef, emblaApi] = useEmblaCarousel({ loop: false, watchDrag: true });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    setSelectedIndex(0);
    emblaApi?.scrollTo(0, true);
  }, [media, emblaApi]);

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
                {media.length > 1 && <div className="absolute right-[10px] top-[10px] rounded-full bg-black/65 px-[8px] py-[4px] text-[11px] font-[600] text-white">{index + 1} / {media.length}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {media.length > 1 && (
        <>
          <button type="button" aria-label="Slide precedente" onClick={() => emblaApi?.scrollPrev()} disabled={!emblaApi?.canScrollPrev()} className="absolute left-[10px] top-1/2 h-[34px] w-[34px] -translate-y-1/2 rounded-full bg-black/65 text-[24px] leading-none text-white disabled:opacity-30">‹</button>
          <button type="button" aria-label="Slide successiva" onClick={() => emblaApi?.scrollNext()} disabled={!emblaApi?.canScrollNext()} className="absolute right-[10px] top-1/2 h-[34px] w-[34px] -translate-y-1/2 rounded-full bg-black/65 text-[24px] leading-none text-white disabled:opacity-30">›</button>
          <div className="absolute bottom-[10px] left-0 right-0 flex justify-center gap-[5px]" aria-label="Paginazione carosello">
            {media.map((item, index) => (
              <button key={item.id || index} type="button" aria-label={`Vai alla slide ${index + 1}`} onClick={() => emblaApi?.scrollTo(index)} className={clsx('h-[6px] w-[6px] rounded-full transition-all', selectedIndex === index ? (dark ? 'w-[18px] bg-white' : 'w-[18px] bg-slate-900') : (dark ? 'bg-white/45' : 'bg-slate-400'))} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const ConnectedCarouselStrip: FC<{
  media: PreviewMedia[];
  dark?: boolean;
}> = ({ media, dark = false }) => {
  if (media.length < 2) return null;
  return (
    <div className={clsx('rounded-[10px] border p-[10px]', dark ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-slate-50')}>
      <div className={clsx('mb-[8px] text-[10px] font-[700] uppercase tracking-[0.12em]', dark ? 'text-white/50' : 'text-slate-500')}>Continuità del carosello</div>
      <div className="flex gap-[5px] overflow-x-auto pb-[2px]">
        {media.map((item, index) => (
          <div key={item.id || `${item.path}-${index}`} className="relative h-[64px] w-[48px] shrink-0 overflow-hidden rounded-[4px] bg-black ring-1 ring-black/10">
            <MediaSurface media={item} />
            <span className="absolute bottom-0 left-0 right-0 bg-black/65 py-[2px] text-center text-[10px] font-[700] text-white">{index + 1}</span>
          </div>
        ))}
      </div>
      <div className={clsx('mt-[7px] text-[11px]', dark ? 'text-white/55' : 'text-slate-500')}>L’ordine segue esattamente il carosello Postiz.</div>
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
    <div className="flex items-center justify-between gap-[10px] p-[14px]">
      <ProfileHeader name={model.profile.name} image={model.profile.image} eyebrow="Instagram" dark />
      <span className="text-[22px] leading-none text-white/70">•••</span>
    </div>
    <PreviewMediaCarousel media={model.media} label="Instagram carousel preview" dark />
    <div className="flex items-center justify-between px-[14px] pt-[12px]">
      <div className="flex gap-[15px] text-[22px]" aria-hidden="true"><span>♡</span><span>○</span><span>⌁</span></div>
      {model.media.length > 1 && <div className="text-[11px] text-white/55">{model.media.length} slide</div>}
      <span className="text-[22px]" aria-hidden="true">⌑</span>
    </div>
    <div className="flex flex-col gap-[9px] p-[14px]">
      <div className="text-[11px] text-white/50">{mediaLabel(model)} · {formatWhen(model.scheduledAt)}</div>
      <Caption text={model.caption} dark />
      <ConnectedCarouselStrip media={model.media} dark />
    </div>
  </div>
);

export const FacebookPreviewCard: FC<{
  model: PlatformPreviewModel;
  onOpenDetail: () => void;
}> = ({ model, onOpenDetail }) => (
  <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[14px] bg-white text-slate-900 shadow-2xl ring-1 ring-black/10">
    <div className="flex items-center justify-between gap-[10px] p-[16px] pb-[10px]">
      <ProfileHeader name={model.profile.name} image={model.profile.image} eyebrow="Pagina Facebook" />
      <span className="text-[22px] leading-none text-slate-400">•••</span>
    </div>
    <div className="px-[16px] pb-[14px]"><Caption text={model.caption} /></div>
    <PreviewMediaCarousel media={model.media} label="Facebook gallery preview" />
    <div className="flex items-center justify-between border-b border-slate-200 px-[16px] py-[10px] text-[11px] text-slate-500">
      <span>{formatWhen(model.scheduledAt)}</span><span>{mediaLabel(model)}</span>
    </div>
    <div className="grid grid-cols-3 border-b border-slate-200 text-center text-[12px] font-[600] text-slate-600"><div className="py-[10px]">Mi piace</div><div className="py-[10px]">Commenta</div><div className="py-[10px]">Condividi</div></div>
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
    <div className="flex flex-wrap gap-[6px] p-[16px]"><NeptiveBadge>{mediaLabel(model)}</NeptiveBadge><NeptiveBadge tone={statusTone(model.publishingState)}>{model.publishingState}</NeptiveBadge></div>
    <div className="px-[16px] pb-[18px]"><ConnectedCarouselStrip media={model.media} /></div>
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
