import { BrandMark } from "@/components/brand/BrandMark";

const DEFAULT_TITLE = "KameOps";

export interface KameFormBrandHeaderProps {
  /** Main heading below the logo. */
  title?: string;
}

/**
 * KameOps branded form header (overlapping card top).
 * Ancestor must use `position: relative`.
 */
export function KameFormBrandHeader({
  title = DEFAULT_TITLE,
}: KameFormBrandHeaderProps) {
  return (
    <div className="space-y-6 pt-10 md:pt-14">
      <div className="absolute left-0 right-0 top-[-3.5rem] mx-auto flex justify-center md:top-[-4.5rem]">
        <BrandMark size="lg" className="border-4 border-card shadow-elevated" />
      </div>
      <h2 className="text-center font-display text-2xl font-bold text-primary md:text-3xl">
        {title}
      </h2>
    </div>
  );
}
