import { getPhotoPanelFields, type Photo } from '@/lib/photos';

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
    <dt className="text-stone-500">{label}</dt>
    <dd className="break-words text-stone-100">{value}</dd>
  </div>
);

const PhotoInfoPanel = ({ photo, className = '' }: PhotoInfoPanelProps) => {
  const fields = getPhotoPanelFields(photo);

  return (
    <dl className={`divide-y divide-white/[0.055] ${className}`}>
      {fields.map((field) => (
        <ArchiveField
          key={field.label}
          label={field.label}
          value={field.value}
        />
      ))}

      {photo.description ? (
        <ArchiveField label="Description" value={photo.description} />
      ) : null}
    </dl>
  );
};

export { PhotoInfoPanel };
