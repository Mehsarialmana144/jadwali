export default function CompanyBadge({ company, className = '' }) {
  if (!company?.name) return null
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {company.logo_url ? (
        <img
          src={company.logo_url}
          alt=""
          className="w-4 h-4 rounded object-cover flex-shrink-0"
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <span
          className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
          style={{ backgroundColor: company.accent_color || '#4f52eb' }}
        >
          {company.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{company.name}</span>
    </span>
  )
}
