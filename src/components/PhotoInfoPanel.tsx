import { getPhotoMetadataGroups, type Photo } from '@/lib/photos';

type PhotoInfoPanelProps = {
  photo: Photo;
  className?: string;
};

type ArchiveFieldProps = {
  label: string;
  value: string;
};

const ArchiveField = ({ label, value }: ArchiveFieldProps) => (
  <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3 py-1.5 text-sm leading-5 sm:grid-cols-[118px_minmax(0,1fr)]">
    <dt className="text-stone-400">{label}</dt>
    <dd className="break-words text-stone-100">{value}</dd>
  </div>
);

const PhotoInfoPanel = ({ photo, className = '' }: PhotoInfoPanelProps) => {
  const groups = getPhotoMetadataGroups(photo);

  return (
    <div className={`space-y-5 ${className}`}>
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="mb-2 text-xs font-semibold text-[#9db6b0]">
            {group.title}
          </h2>
          <dl className="divide-y divide-white/[0.055]">
            {group.fields.map((field) => (
              <ArchiveField
                key={`${group.title}-${field.label}`}
                label={field.label}
                value={field.value}
              />
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
};

export { PhotoInfoPanel };
