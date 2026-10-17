// 線画アイコンセット (絵文字の代わりに統一された 1.6px ストロークで描画)
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
})
const mk = (d: React.ReactNode) => ({ size, ...rest }: P) => <svg {...base(size)} {...rest} aria-hidden>{d}</svg>

export const IPlay = ({ size, ...r }: P) => <svg {...base(size)} {...r} aria-hidden><path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" /></svg>
export const IPause = mk(<><path d="M8 5v14M16 5v14" strokeWidth={2.4} /></>)
export const IStop = ({ size, ...r }: P) => <svg {...base(size)} {...r} aria-hidden><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" /></svg>
export const IRec = ({ size, ...r }: P) => <svg {...base(size)} {...r} aria-hidden><circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none" /></svg>
export const ILoop = mk(<><path d="M17 2.5 20 5.5l-3 3" /><path d="M4 11.5v-1a5 5 0 0 1 5-5h11" /><path d="M7 21.5 4 18.5l3-3" /><path d="M20 12.5v1a5 5 0 0 1-5 5H4" /></>)
export const IMetro = mk(<><path d="M9 3h6l3.5 18h-13z" /><path d="m12 15 5-8" /></>)
export const IUndo = mk(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>)
export const IRedo = mk(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>)
export const ITrash = mk(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>)
export const IGrid = mk(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></>)
export const ICheck = mk(<path d="m5 12.5 4.5 4.5L19 7.5" />)
export const IShuffle = mk(<><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></>)
export const IX = mk(<path d="M6 6l12 12M18 6 6 18" />)
export const ISpark = mk(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.5 6.5 2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" /></>)
export const IWand = mk(<><path d="m15 4 1.2 2.8L19 8l-2.8 1.2L15 12l-1.2-2.8L11 8l2.8-1.2z" /><path d="M4 20 13 11" /></>)
export const IArrowR = mk(<path d="M5 12h14M13 6l6 6-6 6" />)
export const ISave = mk(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>)
export const IVol = mk(<><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>)
export const IMute = mk(<><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m16 9 6 6M22 9l-6 6" /></>)
export const IDice = mk(<><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r=".9" fill="currentColor" /><circle cx="15" cy="15" r=".9" fill="currentColor" /><circle cx="15" cy="9" r=".9" fill="currentColor" /><circle cx="9" cy="15" r=".9" fill="currentColor" /></>)
export const IMinus = mk(<path d="M6 12h12" />)
export const IPlus = mk(<path d="M12 6v12M6 12h12" />)
export const IChevL = mk(<path d="m14 6-6 6 6 6" />)
export const IChevR = mk(<path d="m10 6 6 6-6 6" />)
export const IRoll = mk(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h4M10 13h5M6 16h3M14 9h3" /></>)
export const IWave = mk(<path d="M3 15c2 0 2-6 4.5-6S10 17 12.5 17 15 7 17.5 7 20 13 21 13" />)
export const IBars = mk(<path d="M5 20V12M10 20V6M15 20v-9M20 20V9" />)
export const ISliders = mk(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>)
export const IKeys = mk(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 5v8M12 5v14M16 5v8" /></>)
