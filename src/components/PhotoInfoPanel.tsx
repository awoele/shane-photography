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
  <section className="space-y-1.5">
    <h3 className="text-[10px] font-medium uppercase tracking-[0.24em] text-stone-500">
      {label}
    </h3>
    <p className="break-words text-sm leading-6 text-stone-100">{value}</p>
  </section>
);

const PhotoInfoPanel = ({ photo, className = '' }: PhotoInfoPanelProps) => {
  const fields = getPhotoPanelFields(photo);

  return (
    <div className={`space-y-5 ${className}`}>
      {fields.map((field) => (
        <ArchiveField
          key={field.label}
          label={field.label}
          value={field.value}
        />
      ))}

      {photo.description ? (
        <ArchiveField label="DESCRIPTION" value={photo.description} />
      ) : null}
    </div>
  );
};

export { PhotoInfoPanel };
