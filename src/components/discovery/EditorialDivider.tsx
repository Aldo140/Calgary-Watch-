export function EditorialDivider({ 
  label, 
  emblem = 'spark' 
}: { 
  label?: string; 
  emblem?: 'spark' | 'bow' 
}) {
  return (
    <div className="cw-editorial-divider" aria-hidden="true">
      <div className="cw-divider-rule" />
      <div className="cw-divider-center">
        {emblem === 'bow' ? (
          <img 
            src="/images/illustration/calgary-bow-emblem.webp" 
            alt="" 
            className="cw-divider-bow" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/brand/calgarywatch-city-spark-v2.webp'; }}
          />
        ) : (
          <img 
            src="/images/brand/calgarywatch-city-spark-v2.webp" 
            alt="" 
            className="cw-divider-spark" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/brand/calgary-watch-plane-mark.webp'; }}
          />
        )}
        {label && <span className="cw-divider-label">{label}</span>}
      </div>
      <div className="cw-divider-rule" />
    </div>
  );
}
